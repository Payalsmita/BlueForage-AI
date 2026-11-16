package com.blueprintforge;

import com.blueprintforge.Models.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/** Doc -> structured patterns, with a deterministic verbatim-quote check and an on-disk cache. */
@Service
public class Extractor {
    static final String SYSTEM = """
            You are an implementation analyst reviewing a recruiting-system implementation document.
            Extract only what the document states:
            - stages: every hiring stage, in order.
            - roles: people or teams who perform hiring work (screen, interview, decide, run checks, prepare offers).
              Someone who appears ONLY as an approver in an approval rule is NOT a role; list them under that rule's approvers.
            - approvalRules: EVERY approval, sign-off, or notification requirement. Go through each sentence and bullet; do not skip any.
            For every item, include the full sentence (or table row) it comes from, copied EXACTLY, character for character.
            Do not paraphrase or shorten quotes. If something is not stated, omit it.
            Ignore stages or checks the document says are NOT used.
            """;

    private final Llm llm;
    private final DocStore docs;
    private final JsonMapper json;
    private final Path cacheDir;

    public Extractor(Llm llm, DocStore docs, JsonMapper json, @Value("${blueprint.data-dir}") String dataDir) {
        this.llm = llm;
        this.docs = docs;
        this.json = json;
        this.cacheDir = Path.of(dataDir, "extractions");
    }

    public Extraction extract(DocMeta doc, boolean force) throws Exception {
        Path cached = cacheDir.resolve(doc.docId() + ".json");
        if (!force && Files.exists(cached)) return json.readValue(cached.toFile(), Extraction.class);

        Extraction result = run(doc, docs.text(doc));
        Files.createDirectories(cacheDir);
        json.writeValue(cached.toFile(), result);
        return result;
    }

    /** Same extraction for ad-hoc text (a new customer's notes); not cached. */
    public Extraction extractText(String text) {
        return run(new DocMeta("CUSTOMER", "", "", "", ""), text);
    }

    /**
     * One extraction plus a single retry when stages or approval rules come back empty: every implementation
     * doc states both, and fast models occasionally return a near-empty answer. Keeps the fuller of the two.
     */
    private Extraction run(DocMeta doc, String text) {
        String prompt = "<document id=\"" + doc.docId() + "\">\n" + text + "\n</document>";
        Extraction first = checkEvidence(doc, llm.structured(Patterns.class, SYSTEM, prompt), text);
        if (!first.patterns().stages().isEmpty() && !first.patterns().approvalRules().isEmpty()) return first;
        Extraction second = checkEvidence(doc, llm.structured(Patterns.class, SYSTEM, prompt), text);
        return size(second) > size(first) ? second : first;
    }

    static int size(Extraction e) {
        var p = e.patterns();
        return p.stages().size() + p.roles().size() + p.approvalRules().size();
    }

    // ponytail: one global cap; per-provider limits if several endpoints are ever used
    private static final java.util.concurrent.Semaphore PARALLEL = new java.util.concurrent.Semaphore(8);

    /** Extract a whole group in parallel, at most 8 LLM calls in flight across all requests. */
    public List<Extraction> extractAll(List<DocMeta> group, boolean force) throws Exception {
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<Extraction>> futures = group.stream().map(d -> pool.submit(() -> {
                PARALLEL.acquire();
                try { return extract(d, force); } finally { PARALLEL.release(); }
            })).toList();
            var out = new java.util.ArrayList<Extraction>();
            for (var f : futures) out.add(f.get());
            return out;
        }
    }

    // ---- deterministic evidence check (no LLM) ----

    static String norm(String s) {
        return s.replaceAll("[‘’]", "'").replaceAll("[“”]", "\"")
                .replaceAll("[*_`|#]", "") // markdown noise the model may drop
                .replaceAll("\\s+", " ").trim().toLowerCase();
    }

    /** Keep only quotes that appear verbatim in the source; drop items left without evidence. */
    static Extraction checkEvidence(DocMeta doc, Patterns p, String source) {
        String src = norm(source);
        int[] dropped = {0};
        java.util.function.Function<List<String>, List<String>> keep = qs -> {
            List<String> ok = qs.stream().filter(q -> !norm(q).isEmpty() && src.contains(norm(q))).toList();
            dropped[0] += qs.size() - ok.size();
            return ok;
        };
        var stages = p.stages().stream().map(s -> new Stage(s.name(), s.order(), keep.apply(s.quotes())))
                .filter(s -> !s.quotes().isEmpty()).toList();
        var roles = p.roles().stream().map(r -> new Role(r.name(), r.responsibilities(), keep.apply(r.quotes())))
                .filter(r -> !r.quotes().isEmpty()).toList();
        var rules = p.approvalRules().stream().map(r -> new ApprovalRule(r.trigger(), r.approvers(), keep.apply(r.quotes())))
                .filter(r -> !r.quotes().isEmpty()).toList();
        return new Extraction(doc, new Patterns(stages, roles, rules), dropped[0]);
    }
}
