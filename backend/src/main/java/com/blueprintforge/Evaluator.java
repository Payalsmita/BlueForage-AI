package com.blueprintforge;

import com.blueprintforge.Models.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Scores cached extractions against docs/ground_truth.json (written by tools/gen_synthetic_docs.py).
 * No LLM calls: run blueprint generation first so extractions are cached.
 */
@Service
public class Evaluator {
    private static final Set<String> STOP = Set.of("the", "a", "an", "and", "of", "&", "with", "for", "to");

    private final DocStore docs;
    private final JsonMapper json;
    private final Path gold, cache;

    public Evaluator(DocStore docs, JsonMapper json, @Value("${blueprint.docs-dir}") String docsDir,
                     @Value("${blueprint.data-dir}") String dataDir) {
        this.docs = docs;
        this.json = json;
        this.gold = Path.of(docsDir, "ground_truth.json");
        this.cache = Path.of(dataDir, "extractions");
    }

    public EvalReport evaluate(String industry, String workflowType) {
        Map<String, Map<Kind, List<String>>> answers = Files.exists(gold)
                ? json.readValue(gold.toFile(), new TypeReference<>() {}) : Map.of();
        var extractions = new ArrayList<Extraction>();
        var skipped = new ArrayList<String>();
        for (DocMeta d : docs.group(industry, workflowType)) {
            Path p = cache.resolve(d.docId() + ".json");
            if (!answers.containsKey(d.docId()) || !Files.exists(p)) skipped.add(d.docId());
            else extractions.add(json.readValue(p.toFile(), Extraction.class));
        }
        if (extractions.isEmpty())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Nothing to evaluate: generate the blueprint first (docs without an answer key are skipped)");
        return score(industry, workflowType, extractions, answers, skipped);
    }

    // ---- deterministic scoring (unit-tested) ----

    static Set<String> tokens(String s) {
        var out = new TreeSet<String>();
        for (String t : Extractor.norm(s).split("[^a-z0-9]+")) if (!t.isEmpty() && !STOP.contains(t)) out.add(t);
        return out;
    }

    /** Names match if one's words contain the other's, or they share at least half their words. */
    static boolean sameName(String a, String b) {
        Set<String> x = tokens(a), y = tokens(b);
        if (x.isEmpty() || y.isEmpty()) return false;
        if (x.containsAll(y) || y.containsAll(x)) return true;
        var inter = new HashSet<>(x); inter.retainAll(y);
        var union = new HashSet<>(x); union.addAll(y);
        return (double) inter.size() / union.size() >= 0.5;
    }

    /** Approval rules are matched by evidence: an extracted quote overlaps the answer-key sentence. */
    static boolean sameRule(String goldSentence, List<String> quotes) {
        String g = Extractor.norm(goldSentence);
        return quotes.stream().map(Extractor::norm).anyMatch(q -> q.length() >= 15 && (g.contains(q) || q.contains(g)));
    }

    record Item(String label, List<String> quotes) {}

    static List<Item> items(Patterns p, Kind k) {
        return switch (k) {
            case STAGE -> p.stages().stream().map(s -> new Item(s.name(), s.quotes())).toList();
            case ROLE -> p.roles().stream().map(r -> new Item(r.name(), r.quotes())).toList();
            case APPROVAL_RULE -> p.approvalRules().stream().map(r -> new Item(r.trigger(), r.quotes())).toList();
        };
    }

    static EvalReport score(String industry, String workflowType, List<Extraction> extractions,
                            Map<String, Map<Kind, List<String>>> answers, List<String> skipped) {
        int kept = 0, dropped = 0, added = 0;
        for (Extraction e : extractions) {
            dropped += e.droppedQuotes();
            added += e.selfCheckAdded();
            for (Kind k : Kind.values()) kept += items(e.patterns(), k).stream().mapToInt(i -> i.quotes().size()).sum();
        }
        var baseline = extractions.stream().map(Evaluator::withoutSelfCheck).toList();
        return new EvalReport(industry, workflowType, extractions.size(), skipped, scores(extractions, answers),
                kept, dropped, added > 0 ? scores(baseline, answers) : null, added);
    }

    /** The extraction as it was before the self-check pass merged its additions in. */
    static Extraction withoutSelfCheck(Extraction e) {
        if (e.selfCheck() == null) return e;
        var p = e.patterns();
        var a = e.selfCheck();
        return new Extraction(e.doc(), new Patterns(
                p.stages().stream().filter(x -> !a.stages().contains(x)).toList(),
                p.roles().stream().filter(x -> !a.roles().contains(x)).toList(),
                p.approvalRules().stream().filter(x -> !a.approvalRules().contains(x)).toList()), e.droppedQuotes());
    }

    static List<KindScore> scores(List<Extraction> extractions, Map<String, Map<Kind, List<String>>> answers) {
        var scores = new ArrayList<KindScore>();
        for (Kind k : Kind.values()) {
            int expected = 0, extracted = 0, matchedCount = 0;
            var missed = new ArrayList<String>();
            var extra = new ArrayList<String>();
            for (Extraction e : extractions) {
                String id = e.doc().docId();
                List<String> want = answers.get(id).getOrDefault(k, List.of());
                List<Item> got = new ArrayList<>(items(e.patterns(), k));
                expected += want.size();
                extracted += got.size();
                for (String w : want) {
                    Optional<Item> hit = got.stream()
                            .filter(g -> k == Kind.APPROVAL_RULE ? sameRule(w, g.quotes()) : sameName(w, g.label()))
                            .findFirst();
                    if (hit.isPresent()) { matchedCount++; got.remove(hit.get()); }
                    else missed.add(id + ": " + w);
                }
                got.forEach(g -> extra.add(id + ": " + g.label()));
            }
            scores.add(new KindScore(k, expected, extracted, matchedCount,
                    extracted == 0 ? 0 : (double) matchedCount / extracted,
                    expected == 0 ? 0 : (double) matchedCount / expected, missed, extra));
        }
        return scores;
    }
}
