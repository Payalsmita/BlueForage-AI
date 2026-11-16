package com.blueprintforge;

import com.blueprintforge.Models.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Extractions -> blueprint.
 * Rule: counts, order and evidence come only from code here. The LLM only maps names and writes prose.
 */
@Service
public class Blueprints {
    static final String NORMALIZE_SYSTEM = """
            You normalize recruiting workflow terms collected from several companies in the same industry.
            Map every input name to a canonical name. Names that mean the same stage, role, or approval rule
            must share exactly one canonical name (prefer the clearest, most common wording).
            Return exactly one mapping per input (same kind and name as given). Never add or drop inputs.
            """;
    static final String SYNTH_SYSTEM = """
            You write short descriptions for items in a recruiting workflow blueprint.
            For each item, write 1-2 sentences using ONLY the supplied quotes. Do not add facts.
            Describe the item generically for the industry (no company names). Do not start with the id or the item name.
            Return one entry per item id.
            """;

    private final Extractor extractor;
    private final DocStore docs;
    private final Llm llm;
    private final JsonMapper json;
    private final Path dir;

    public Blueprints(Extractor extractor, DocStore docs, Llm llm, JsonMapper json,
                      @Value("${blueprint.data-dir}") String dataDir) {
        this.extractor = extractor;
        this.docs = docs;
        this.llm = llm;
        this.json = json;
        this.dir = Path.of(dataDir, "blueprints");
    }

    public Blueprint generate(String industry, String workflowType, boolean force) throws Exception {
        List<DocMeta> group = docs.group(industry, workflowType);
        if (group.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No docs for " + industry + "/" + workflowType);
        List<Extraction> extractions = extractor.extractAll(group, force);

        // 1. LLM maps names to canonical names
        var inputs = mentions(extractions).stream()
                .map(m -> m.kind() + " | " + m.name()).distinct().sorted().collect(Collectors.joining("\n"));
        Canons canons = llm.structured(Canons.class, NORMALIZE_SYSTEM, inputs);
        Map<String, String> canonMap = new HashMap<>();
        for (Canon c : canons.mappings()) canonMap.put(key(c.kind(), c.name()), c.canonical());

        // 2. Code counts support and merges evidence
        List<BlueprintItem> items = aggregate(extractions, canonMap);

        // 3. LLM writes descriptions from the evidence only
        String synthInput = items.stream()
                .map(i -> "id=" + i.id() + " kind=" + i.kind() + " name=" + i.name() + "\nquotes:\n- "
                        + i.evidence().stream().map(Evidence::quote).distinct().collect(Collectors.joining("\n- ")))
                .collect(Collectors.joining("\n\n"));
        Map<String, String> details = llm.structured(Details.class, SYNTH_SYSTEM, synthInput).items().stream()
                .collect(Collectors.toMap(Detail::id, Detail::detail, (a, b) -> a));
        items = items.stream().map(i -> i.withDetail(details.getOrDefault(i.id(), ""))).toList();

        var bp = new Blueprint(industry, workflowType, group.stream().map(DocMeta::docId).toList(), items,
                orderConflicts(extractions, canonMap));
        save(bp);
        return bp;
    }

    public Blueprint get(String industry, String workflowType) {
        Path p = file(industry, workflowType);
        if (!Files.exists(p)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Blueprint not generated yet");
        return json.readValue(p.toFile(), Blueprint.class);
    }

    public synchronized Blueprint review(String industry, String workflowType, String itemId, Review r) {
        if (r.status() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "status is required");
        if (r.status() == Status.EDITED && (r.editedDetail() == null || r.editedDetail().isBlank()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "editedDetail is required when status is EDITED");
        Blueprint bp = get(industry, workflowType);
        if (bp.items().stream().noneMatch(i -> i.id().equals(itemId)))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown item " + itemId);
        var items = bp.items().stream()
                .map(i -> i.id().equals(itemId) ? i.reviewed(r.status(), r.status() == Status.EDITED ? r.editedDetail() : i.editedDetail()) : i)
                .toList();
        var updated = bp.withItems(items);
        save(updated);
        return updated;
    }

    /** Only approved/edited items leave the system. */
    public Blueprint approvedOnly(String industry, String workflowType) {
        Blueprint bp = get(industry, workflowType);
        return bp.withItems(bp.items().stream()
                .filter(i -> i.status() == Status.APPROVED || i.status() == Status.EDITED).toList());
    }

    public String exportMarkdown(String industry, String workflowType) {
        Blueprint bp = approvedOnly(industry, workflowType);
        var sb = new StringBuilder("# Blueprint: " + industry + " / " + workflowType + "\n\n")
                .append("Source implementations: ").append(String.join(", ", bp.sourceDocIds())).append("\n");
        for (Kind k : Kind.values()) {
            sb.append("\n## ").append(switch (k) { case STAGE -> "Hiring stages"; case ROLE -> "Roles"; case APPROVAL_RULE -> "Approval rules"; }).append("\n\n");
            bp.items().stream().filter(i -> i.kind() == k).forEach(i -> {
                sb.append("### ").append(i.name()).append("  \n")
                        .append("_Confidence: found in ").append(i.support()).append("/").append(i.total()).append(" implementations · ")
                        .append(i.geoSupport().stream().map(g -> g.geography() + " " + g.support() + "/" + g.total()).collect(Collectors.joining(", ")))
                        .append("_\n\n")
                        .append(i.status() == Status.EDITED ? i.editedDetail() : i.detail()).append("\n\n");
                if (i.approvers() != null && !i.approvers().isEmpty())
                    sb.append("Approvers: ").append(String.join(", ", i.approvers())).append("\n\n");
                i.evidence().forEach(e -> sb.append("> ").append(e.quote()).append(" — ").append(e.docId()).append("\n"));
                sb.append("\n");
            });
        }
        var conflicts = bp.orderConflicts() == null ? List.<OrderConflict>of() : bp.orderConflicts();
        if (!conflicts.isEmpty()) {
            sb.append("## Order differences between implementations\n\n");
            conflicts.forEach(c -> sb.append("- ").append(c.stageA()).append(" before ").append(c.stageB())
                    .append(" in ").append(String.join(", ", c.aFirstDocIds())).append("; after in ")
                    .append(String.join(", ", c.bFirstDocIds())).append("\n"));
        }
        return sb.toString();
    }

    // ---- deterministic aggregation (unit-tested) ----

    record Mention(Kind kind, String name, String docId, String geo, Integer order, List<String> quotes, List<String> approvers) {}

    static String key(Kind k, String name) { return k + "|" + name.trim().toLowerCase(); }

    static List<Mention> mentions(List<Extraction> extractions) {
        var out = new ArrayList<Mention>();
        for (Extraction e : extractions) {
            String id = e.doc().docId(), geo = e.doc().geography();
            e.patterns().stages().forEach(s -> out.add(new Mention(Kind.STAGE, s.name(), id, geo, s.order(), s.quotes(), List.of())));
            e.patterns().roles().forEach(r -> out.add(new Mention(Kind.ROLE, r.name(), id, geo, null, r.quotes(), List.of())));
            e.patterns().approvalRules().forEach(r -> out.add(new Mention(Kind.APPROVAL_RULE, r.trigger(), id, geo, null, r.quotes(),
                    r.approvers() == null ? List.of() : r.approvers())));
        }
        return out;
    }

    /** Group mentions by canonical name; support = distinct docs (overall and per country); stages sorted by mean order. */
    static List<BlueprintItem> aggregate(List<Extraction> extractions, Map<String, String> canonMap) {
        int total = extractions.size();
        Map<String, Long> docsPerGeo = extractions.stream()
                .collect(Collectors.groupingBy(e -> e.doc().geography(), TreeMap::new, Collectors.counting()));
        Map<String, List<Mention>> groups = new LinkedHashMap<>();
        for (Mention m : mentions(extractions)) {
            String canonical = canonMap.getOrDefault(key(m.kind(), m.name()), m.name().trim());
            groups.computeIfAbsent(m.kind() + "|" + canonical, k -> new ArrayList<>()).add(m);
        }
        var items = new ArrayList<BlueprintItem>();
        groups.forEach((k, ms) -> {
            Kind kind = ms.getFirst().kind();
            String canonical = k.substring(k.indexOf('|') + 1);
            int support = (int) ms.stream().map(Mention::docId).distinct().count();
            Double order = kind == Kind.STAGE
                    ? ms.stream().filter(m -> m.order() != null).mapToInt(Mention::order).average().orElse(0) : null;
            var aliases = ms.stream().map(m -> m.name().trim()).filter(n -> !n.equals(canonical)).distinct().toList();
            var evidence = ms.stream().flatMap(m -> m.quotes().stream().map(q -> new Evidence(m.docId(), q))).distinct().toList();
            var geo = docsPerGeo.entrySet().stream().map(g -> new GeoSupport(g.getKey(),
                    (int) ms.stream().filter(m -> m.geo().equals(g.getKey())).map(Mention::docId).distinct().count(),
                    g.getValue().intValue())).toList();
            var approvers = ms.stream().flatMap(m -> m.approvers().stream()).map(String::trim).filter(a -> !a.isEmpty())
                    .collect(Collectors.groupingBy(a -> a, LinkedHashMap::new, Collectors.counting()))
                    .entrySet().stream().sorted(Map.Entry.<String, Long>comparingByValue().reversed()).map(Map.Entry::getKey).toList();
            items.add(new BlueprintItem(null, kind, canonical, aliases, "", order, support, total, evidence, geo, Status.PENDING, null, approvers));
        });
        items.sort(Comparator.comparing(BlueprintItem::kind)
                .thenComparing(i -> i.typicalOrder() == null ? 0 : i.typicalOrder())
                .thenComparing(BlueprintItem::support, Comparator.reverseOrder()));
        Map<Kind, Integer> counters = new EnumMap<>(Kind.class);
        return items.stream().map(i -> {
            int n = counters.merge(i.kind(), 1, Integer::sum);
            String prefix = switch (i.kind()) { case STAGE -> "STG"; case ROLE -> "ROL"; case APPROVAL_RULE -> "APR"; };
            return i.withId(String.format("%s-%02d", prefix, n));
        }).toList();
    }

    /** Stage pairs that implementations run in opposite orders (canonical names), most disputed first. */
    static List<OrderConflict> orderConflicts(List<Extraction> extractions, Map<String, String> canonMap) {
        Map<String, List<String>> before = new HashMap<>(); // "A\u0000B" -> docs where A comes before B
        for (Extraction e : extractions) {
            var stages = e.patterns().stages().stream()
                    .sorted(Comparator.comparingInt(Stage::order))
                    .map(s -> canonMap.getOrDefault(key(Kind.STAGE, s.name()), s.name().trim()))
                    .distinct().toList();
            for (int i = 0; i < stages.size(); i++)
                for (int j = i + 1; j < stages.size(); j++)
                    before.computeIfAbsent(stages.get(i) + "\u0000" + stages.get(j), k -> new ArrayList<>()).add(e.doc().docId());
        }
        var out = new ArrayList<OrderConflict>();
        before.forEach((k, aFirst) -> {
            String[] ab = k.split("\u0000");
            var bFirst = before.get(ab[1] + "\u0000" + ab[0]);
            if (bFirst != null && ab[0].compareTo(ab[1]) < 0) // report each pair once
                out.add(new OrderConflict(ab[0], ab[1], aFirst, bFirst));
        });
        out.sort(Comparator.comparingInt((OrderConflict c) -> -Math.min(c.aFirstDocIds().size(), c.bFirstDocIds().size()))
                .thenComparing(OrderConflict::stageA));
        return out;
    }

    /** "5/6 (CA 1/1)" style label used in exports and gap findings. */
    static String supportLabel(BlueprintItem i, String geo) {
        String base = i.support() + "/" + i.total();
        return i.geoSupport().stream().filter(g -> g.geography().equalsIgnoreCase(geo == null ? "" : geo)).findFirst()
                .map(g -> base + " (" + g.geography() + " " + g.support() + "/" + g.total() + ")").orElse(base);
    }

    private Path file(String industry, String workflowType) {
        if (!DocStore.SLUG.matcher(industry).matches() || !DocStore.SLUG.matcher(workflowType).matches())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid industry/workflowType");
        return dir.resolve(industry + "_" + workflowType + ".json");
    }

    private void save(Blueprint bp) {
        try {
            Files.createDirectories(dir);
            json.writeValue(file(bp.industry(), bp.workflowType()).toFile(), bp);
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
