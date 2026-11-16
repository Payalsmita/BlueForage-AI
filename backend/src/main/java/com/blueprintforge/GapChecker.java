package com.blueprintforge;

import com.blueprintforge.Models.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Collectors;

/**
 * New customer's requirements vs the industry blueprint.
 * LLM: extract the customer's items and map them to blueprint names. Code: decide MISSING / UNIQUE / ALIGNED.
 */
@Service
public class GapChecker {
    /** Blueprint items present in at least this share of peers are flagged when the customer lacks them. */
    static final double MISSING_THRESHOLD = 0.5;
    static final String NONE = "NONE";
    static final String MATCH_SYSTEM = """
            You compare a new customer's recruiting workflow items with an industry blueprint.
            For each CUSTOMER item, find the BLUEPRINT item of the same kind that means the same thing.
            Return exactly one entry per CUSTOMER item:
            customerItem = the customer item's name; blueprintItem = the matching blueprint item's name, or NONE.
            Copy names exactly as listed, without the "KIND |" prefix.
            """;

    private final Extractor extractor;
    private final Blueprints blueprints;
    private final Llm llm;

    public GapChecker(Extractor extractor, Blueprints blueprints, Llm llm) {
        this.extractor = extractor;
        this.blueprints = blueprints;
        this.llm = llm;
    }

    public GapReport check(String industry, String workflowType, GapRequest req) {
        if (req.text() == null || req.text().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "text is required");
        Blueprint bp = blueprints.get(industry, workflowType);
        Patterns customer = extractor.extractText(req.text()).patterns();

        var bpList = active(bp).stream().map(i -> i.kind() + " | " + i.name()).collect(Collectors.joining("\n"));
        var custList = Blueprints.mentions(List.of(new Extraction(new DocMeta("CUSTOMER", "", "", "", ""), customer, 0)))
                .stream().map(m -> m.kind() + " | " + m.name()).distinct().collect(Collectors.joining("\n"));
        Map<String, String> mapping = custList.isEmpty() ? Map.of() : toMapping(
                llm.structured(Matches.class, MATCH_SYSTEM, "BLUEPRINT:\n" + bpList + "\n\nCUSTOMER:\n" + custList).matches(),
                customer, bp);

        String geo = req.geography() == null ? null : req.geography().trim().toUpperCase();
        return new GapReport(industry, workflowType, geo, diff(bp, customer, mapping, geo));
    }

    static String stripKind(String s) {
        return s == null ? "" : s.replaceFirst("^\\s*(STAGE|ROLE|APPROVAL_RULE)\\s*\\|\\s*", "").trim();
    }

    /** customer key -> blueprint name. Tolerates "KIND |" prefixes and swapped fields (seen with fast models). */
    static Map<String, String> toMapping(List<Match> matches, Patterns customer, Blueprint bp) {
        var customerKeys = new HashSet<String>();
        Blueprints.mentions(List.of(new Extraction(new DocMeta("CUSTOMER", "", "", "", ""), customer, 0)))
                .forEach(m -> customerKeys.add(Blueprints.key(m.kind(), m.name())));
        var bpKeys = new HashSet<String>();
        active(bp).forEach(i -> bpKeys.add(Blueprints.key(i.kind(), i.name())));
        Map<String, String> out = new HashMap<>();
        for (Match m : matches) {
            String c = stripKind(m.customerItem()), b = stripKind(m.blueprintItem());
            if (!customerKeys.contains(Blueprints.key(m.kind(), c)) && customerKeys.contains(Blueprints.key(m.kind(), b))
                    && (bpKeys.contains(Blueprints.key(m.kind(), c)) || NONE.equalsIgnoreCase(c))) {
                String t = c; c = b; b = t; // swapped
            }
            out.put(Blueprints.key(m.kind(), c), NONE.equalsIgnoreCase(b) ? NONE : b);
        }
        return out;
    }

    static List<BlueprintItem> active(Blueprint bp) {
        return bp.items().stream().filter(i -> i.status() != Status.REJECTED).toList();
    }

    /** Peer share for this customer: their country's ratio when we have peers there, otherwise overall. */
    static double share(BlueprintItem i, String geo) {
        return i.geoSupport().stream().filter(g -> g.geography().equalsIgnoreCase(geo == null ? "" : geo) && g.total() > 0)
                .findFirst().map(g -> (double) g.support() / g.total())
                .orElse((double) i.support() / i.total());
    }

    // ---- deterministic diff (unit-tested) ----
    static List<GapFinding> diff(Blueprint bp, Patterns customer, Map<String, String> mapping, String geo) {
        Map<String, BlueprintItem> byName = new HashMap<>();
        for (BlueprintItem i : active(bp)) byName.put(Blueprints.key(i.kind(), i.name()), i);

        var findings = new ArrayList<GapFinding>();
        Set<String> matched = new HashSet<>();
        var mentions = Blueprints.mentions(List.of(new Extraction(new DocMeta("CUSTOMER", "", "", "", ""), customer, 0)));
        for (var m : mentions) {
            String target = mapping.getOrDefault(Blueprints.key(m.kind(), m.name()), NONE);
            BlueprintItem hit = NONE.equals(target) ? null : byName.get(Blueprints.key(m.kind(), target));
            if (hit != null) {
                matched.add(hit.id());
                findings.add(new GapFinding(GapType.ALIGNED, m.kind(), hit.name(), hit.id(), Blueprints.supportLabel(hit, geo),
                        m.quotes(), "Matches the industry pattern."));
            } else {
                findings.add(new GapFinding(GapType.UNIQUE, m.kind(), m.name(), null, "0/" + bp.sourceDocIds().size(),
                        m.quotes(), "Not seen in any peer implementation. Confirm it is intentional and configurable."));
            }
        }
        for (BlueprintItem i : active(bp)) {
            if (matched.contains(i.id()) || share(i, geo) < MISSING_THRESHOLD) continue;
            findings.add(new GapFinding(GapType.MISSING, i.kind(), i.name(), i.id(), Blueprints.supportLabel(i, geo), List.of(),
                    "Used by " + Blueprints.supportLabel(i, geo) + " peer implementations but not in this customer's requirements. Ask whether it is needed."));
        }
        // MISSING (most common first), then UNIQUE, then ALIGNED
        Map<String, BlueprintItem> byId = active(bp).stream().collect(Collectors.toMap(BlueprintItem::id, i -> i));
        findings.sort(Comparator.comparing(GapFinding::type)
                .thenComparing(f -> f.blueprintItemId() == null ? 0 : -share(byId.get(f.blueprintItemId()), geo)));
        // ALIGNED can repeat if two customer items map to the same blueprint item; keep the first
        Set<String> seen = new HashSet<>();
        return findings.stream().filter(f -> f.type() != GapType.ALIGNED || seen.add(f.blueprintItemId())).toList();
    }
}
