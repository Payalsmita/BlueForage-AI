package com.blueprintforge;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;

import java.util.List;

/** All data shapes in one place. Records double as LLM structured-output schemas. */
public final class Models {
    private Models() {}

    public record DocMeta(String docId, String filename, String industry, String geography, String workflowType) {}

    // ---- LLM extraction output (one per doc) ----
    public record Stage(
            String name,
            @JsonPropertyDescription("1-based position in the workflow") int order,
            @JsonPropertyDescription("Verbatim sentences copied exactly from the document") List<String> quotes) {}

    public record Role(String name, List<String> responsibilities,
            @JsonPropertyDescription("Verbatim sentences copied exactly from the document") List<String> quotes) {}

    public record ApprovalRule(
            @JsonPropertyDescription("What triggers the approval, e.g. 'offer above standard pay band'") String trigger,
            List<String> approvers,
            @JsonPropertyDescription("Verbatim sentences copied exactly from the document") List<String> quotes) {}

    public record Patterns(List<Stage> stages, List<Role> roles, List<ApprovalRule> approvalRules) {}

    /** Cached per doc in data/extractions/{docId}.json. droppedQuotes = quotes that failed the verbatim check. */
    public record Extraction(DocMeta doc, Patterns patterns, int droppedQuotes) {}

    // ---- LLM normalization / synthesis output ----
    public enum Kind { STAGE, ROLE, APPROVAL_RULE }

    public record Canon(Kind kind, String name, String canonical) {}
    public record Canons(List<Canon> mappings) {}

    public record Match(Kind kind,
            @JsonPropertyDescription("The CUSTOMER item name, exactly as listed, without the kind prefix") String customerItem,
            @JsonPropertyDescription("The equivalent BLUEPRINT item name exactly as listed without the kind prefix, or NONE") String blueprintItem) {}
    public record Matches(List<Match> matches) {}

    public record Detail(String id, @JsonPropertyDescription("1-2 sentences, grounded only in the quotes") String detail) {}
    public record Details(List<Detail> items) {}

    // ---- Blueprint ----
    public enum Status { PENDING, APPROVED, EDITED, REJECTED }

    public record Evidence(String docId, String quote) {}

    /** How many implementations in one country contain the item, e.g. DE 2/2. */
    public record GeoSupport(String geography, int support, int total) {}

    /** approvers: approval rules only, most frequently named first. */
    public record BlueprintItem(String id, Kind kind, String name, List<String> aliases, String detail,
                                Double typicalOrder, int support, int total, List<Evidence> evidence,
                                List<GeoSupport> geoSupport, Status status, String editedDetail, List<String> approvers) {
        public BlueprintItem(String id, Kind kind, String name, List<String> aliases, String detail, Double typicalOrder,
                             int support, int total, List<Evidence> evidence, List<GeoSupport> geoSupport, Status status, String editedDetail) {
            this(id, kind, name, aliases, detail, typicalOrder, support, total, evidence, geoSupport, status, editedDetail, List.of());
        }
        BlueprintItem withId(String newId) {
            return new BlueprintItem(newId, kind, name, aliases, detail, typicalOrder, support, total, evidence, geoSupport, status, editedDetail, approvers);
        }
        BlueprintItem withDetail(String d) {
            return new BlueprintItem(id, kind, name, aliases, d, typicalOrder, support, total, evidence, geoSupport, status, editedDetail, approvers);
        }
        BlueprintItem reviewed(Status s, String edited) {
            return new BlueprintItem(id, kind, name, aliases, detail, typicalOrder, support, total, evidence, geoSupport, s, edited, approvers);
        }
    }

    /** Two stages that peers run in opposite orders: A before B in some implementations, B before A in others. */
    public record OrderConflict(String stageA, String stageB, List<String> aFirstDocIds, List<String> bFirstDocIds) {}

    public record Blueprint(String industry, String workflowType, List<String> sourceDocIds, List<BlueprintItem> items,
                            List<OrderConflict> orderConflicts) {
        public Blueprint(String industry, String workflowType, List<String> sourceDocIds, List<BlueprintItem> items) {
            this(industry, workflowType, sourceDocIds, items, List.of());
        }
        Blueprint withItems(List<BlueprintItem> newItems) {
            return new Blueprint(industry, workflowType, sourceDocIds, newItems, orderConflicts == null ? List.of() : orderConflicts);
        }
    }

    public record Review(Status status, String editedDetail) {}

    // ---- Gap check: new customer vs blueprint ----
    public record GapRequest(String text, String geography) {}

    public enum GapType { MISSING, UNIQUE, ALIGNED }

    public record GapFinding(GapType type, Kind kind, String name, String blueprintItemId, String peerSupport,
                             List<String> customerQuotes, String message) {}

    public record GapReport(String industry, String workflowType, String geography, List<GapFinding> findings) {}

    // ---- Accuracy eval against the generator's answer key ----
    public record KindScore(Kind kind, int expected, int extracted, int matched, double precision, double recall,
                            List<String> missed, List<String> extra) {}

    public record EvalReport(String industry, String workflowType, int docsEvaluated, List<String> docsSkipped,
                             List<KindScore> scores, int quotesKept, int quotesDropped) {}
}
