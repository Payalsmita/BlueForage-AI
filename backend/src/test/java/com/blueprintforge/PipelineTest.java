package com.blueprintforge;

import com.blueprintforge.Models.*;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Deterministic parts only: no LLM, no Spring context. */
class PipelineTest {
    static DocMeta doc(String id) { return doc(id, "US"); }
    static DocMeta doc(String id, String geo) { return new DocMeta(id, id + ".md", "airlines", geo, "pilot"); }

    @Test
    void evidenceCheckDropsInventedQuotes() {
        String src = "## Stages\n1. **Simulator Evaluation** – A Simulator Check Airman runs a 2-hour   sim session.";
        var p = new Patterns(
                List.of(new Stage("Simulator Evaluation", 1, List.of("A Simulator Check Airman runs a 2-hour sim session.")),
                        new Stage("Made Up Stage", 2, List.of("Candidates juggle flaming torches."))),
                List.of(), List.of());
        Extraction e = Extractor.checkEvidence(doc("A"), p, src);
        assertEquals(1, e.patterns().stages().size());
        assertEquals("Simulator Evaluation", e.patterns().stages().getFirst().name());
        assertEquals(1, e.droppedQuotes());
    }

    @Test
    void llmOutputRecordsAreValidStructuredOutputSchemas() {
        for (Class<?> c : List.of(Patterns.class, Canons.class, Details.class, Matches.class))
            assertDoesNotThrow(() -> com.openai.models.chat.completions.ChatCompletionCreateParams.builder()
                    .model("m").addUserMessage("u").responseFormat(c).build(), c.getSimpleName());
    }

    @Test
    void aggregateCountsDistinctDocsAndKeepsEvidence() {
        var a = new Extraction(doc("A"), new Patterns(
                List.of(new Stage("Phone Screen", 2, List.of("qa")), new Stage("Offer", 5, List.of("qa2"))),
                List.of(new Role("Recruiter", List.of(), List.of("ra"))), List.of()), 0);
        var b = new Extraction(doc("B", "CA"), new Patterns(
                List.of(new Stage("Recruiter Screen", 2, List.of("qb")), new Stage("Offer", 7, List.of("qb2"))),
                List.of(), List.of()), 0);
        var canon = Map.of(Blueprints.key(Kind.STAGE, "Phone Screen"), "Recruiter Phone Screen",
                Blueprints.key(Kind.STAGE, "Recruiter Screen"), "Recruiter Phone Screen");

        List<BlueprintItem> items = Blueprints.aggregate(List.of(a, b), canon);

        var screen = items.stream().filter(i -> i.name().equals("Recruiter Phone Screen")).findFirst().orElseThrow();
        assertEquals(2, screen.support());
        assertEquals(2, screen.total());
        assertEquals(List.of("Phone Screen", "Recruiter Screen"), screen.aliases());
        var offer = items.stream().filter(i -> i.name().equals("Offer")).findFirst().orElseThrow();
        assertEquals(6.0, offer.typicalOrder());
        assertEquals("STG-01", screen.id()); // stages sorted by typical order
        for (BlueprintItem i : items) {
            assertFalse(i.evidence().isEmpty(), i.id());
            assertTrue(i.support() > 0 && i.support() <= i.total(), i.id());
        }
        assertEquals(1, items.stream().filter(i -> i.kind() == Kind.ROLE).count());
        var recruiter = items.stream().filter(i -> i.kind() == Kind.ROLE).findFirst().orElseThrow();
        assertEquals(List.of(new GeoSupport("CA", 0, 1), new GeoSupport("US", 1, 1)), recruiter.geoSupport());
    }

    static BlueprintItem item(String id, Kind k, String name, int support, int total, List<GeoSupport> geo) {
        return new BlueprintItem(id, k, name, List.of(), "", null, support, total, List.of(new Evidence("A", "q")), geo, Status.PENDING, null);
    }

    @Test
    void gapCheckFlagsMissingUniqueAlignedAndRespectsGeography() {
        var bp = new Blueprint("airlines", "pilot", List.of("A", "B", "C", "D"), List.of(
                item("STG-01", Kind.STAGE, "Background Check", 4, 4, List.of(new GeoSupport("US", 3, 3), new GeoSupport("CA", 1, 1))),
                item("STG-02", Kind.STAGE, "Drug Test", 3, 4, List.of(new GeoSupport("US", 3, 3), new GeoSupport("CA", 0, 1))),
                item("STG-03", Kind.STAGE, "Offer", 4, 4, List.of()),
                item("STG-04", Kind.STAGE, "Rare Step", 1, 4, List.of())));
        var customer = new Patterns(List.of(new Stage("Job Offer", 3, List.of("We send an offer.")),
                new Stage("Karaoke Round", 2, List.of("Candidates sing."))), List.of(), List.of());
        var mapping = Map.of(Blueprints.key(Kind.STAGE, "Job Offer"), "Offer", Blueprints.key(Kind.STAGE, "Karaoke Round"), "NONE");

        var ca = GapChecker.diff(bp, customer, mapping, "CA");
        assertEquals(List.of("Background Check"), names(ca, GapType.MISSING)); // drug test is US-only, rare step < 50%
        assertEquals(List.of("Karaoke Round"), names(ca, GapType.UNIQUE));
        assertEquals(List.of("Offer"), names(ca, GapType.ALIGNED));

        var us = GapChecker.diff(bp, customer, mapping, "US");
        assertEquals(List.of("Background Check", "Drug Test"), names(us, GapType.MISSING));
    }

    @Test
    void gapMappingToleratesPrefixesAndSwappedFields() {
        var bp = new Blueprint("t", "w", List.of("A"), List.of(
                item("STG-01", Kind.STAGE, "Resume Screen", 1, 1, List.of()),
                item("STG-02", Kind.STAGE, "Offer", 1, 1, List.of())));
        var customer = new Patterns(List.of(new Stage("Application Review", 1, List.of("q")),
                new Stage("Offer", 2, List.of("q")), new Stage("Founder Chat", 3, List.of("q"))), List.of(), List.of());
        // exactly what the model returned in a real run: fields swapped, kind prefix in the value
        var matches = List.of(new Match(Kind.STAGE, "Resume Screen", "STAGE | Application Review"),
                new Match(Kind.STAGE, "Offer", "STAGE | Offer"),
                new Match(Kind.STAGE, "NONE", "STAGE | Founder Chat"));
        var m = GapChecker.toMapping(matches, customer, bp);
        assertEquals("Resume Screen", m.get(Blueprints.key(Kind.STAGE, "Application Review")));
        assertEquals("Offer", m.get(Blueprints.key(Kind.STAGE, "Offer")));
        assertEquals("NONE", m.get(Blueprints.key(Kind.STAGE, "Founder Chat")));
        // and the normal, well-formed shape
        var ok = GapChecker.toMapping(List.of(new Match(Kind.STAGE, "Application Review", "Resume Screen")), customer, bp);
        assertEquals("Resume Screen", ok.get(Blueprints.key(Kind.STAGE, "Application Review")));
    }

    static List<String> names(List<GapFinding> fs, GapType t) {
        return fs.stream().filter(f -> f.type() == t).map(GapFinding::name).toList();
    }

    @Test
    void evalScoresAgainstAnswerKey() {
        var e = new Extraction(doc("A"), new Patterns(
                List.of(new Stage("Recruiter Phone Screen", 1, List.of("x")), new Stage("Invented Stage", 2, List.of("y"))),
                List.of(new Role("Recruiter", List.of(), List.of("z"))),
                List.of(new ApprovalRule("offer above band", List.of(), List.of("Offers above the band need VP approval.")))), 1);
        var gold = Map.of("A", Map.of(
                Kind.STAGE, List.of("Recruiter Screen", "Offer"),
                Kind.ROLE, List.of("Recruiter"),
                Kind.APPROVAL_RULE, List.of("Offers above the band need VP approval.")));
        EvalReport r = Evaluator.score("airlines", "pilot", List.of(e), gold, List.of());
        KindScore stages = r.scores().getFirst();
        assertEquals(1, stages.matched());
        assertEquals(0.5, stages.precision());
        assertEquals(0.5, stages.recall());
        assertEquals(List.of("A: Offer"), stages.missed());
        assertEquals(List.of("A: Invented Stage"), stages.extra());
        assertEquals(1.0, r.scores().get(1).recall());
        assertEquals(1.0, r.scores().get(2).recall());
        assertEquals(1, r.quotesDropped());
    }
}
