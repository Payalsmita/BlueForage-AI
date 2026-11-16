package com.blueprintforge;

import com.blueprintforge.Models.*;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api")
@CrossOrigin // demo: allow a local frontend dev server
public class Api {
    private final DocStore docs;
    private final Extractor extractor;
    private final Blueprints blueprints;
    private final GapChecker gaps;
    private final Evaluator evaluator;

    public Api(DocStore docs, Extractor extractor, Blueprints blueprints, GapChecker gaps, Evaluator evaluator) {
        this.docs = docs;
        this.extractor = extractor;
        this.blueprints = blueprints;
        this.gaps = gaps;
        this.evaluator = evaluator;
    }

    @GetMapping("/docs")
    public List<DocMeta> listDocs() { return docs.list(); }

    public record Group(String industry, String workflowType, long docCount) {}

    /** Scenarios available to generate a blueprint for (one per industry + workflow type). */
    @GetMapping("/groups")
    public List<Group> groups() {
        return docs.list().stream()
                .collect(java.util.stream.Collectors.groupingBy(d -> d.industry() + "|" + d.workflowType(),
                        java.util.TreeMap::new, java.util.stream.Collectors.counting()))
                .entrySet().stream()
                .map(e -> new Group(e.getKey().split("\\|")[0], e.getKey().split("\\|")[1], e.getValue()))
                .toList();
    }

    @PostMapping(value = "/docs", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DocMeta upload(@RequestParam MultipartFile file, @RequestParam String docId, @RequestParam String industry,
                          @RequestParam String geography, @RequestParam String workflowType) throws Exception {
        return docs.add(docId, industry, geography, workflowType, file.getOriginalFilename(), file.getBytes());
    }

    @GetMapping(value = "/docs/{docId}/text", produces = "text/plain;charset=UTF-8")
    public String docText(@PathVariable String docId) { return docs.text(docs.get(docId)); }

    @PostMapping("/extractions/{docId}")
    public Extraction extract(@PathVariable String docId, @RequestParam(defaultValue = "false") boolean force) throws Exception {
        return extractor.extract(docs.get(docId), force);
    }

    @PostMapping("/blueprints/{industry}/{workflowType}")
    public Blueprint generate(@PathVariable String industry, @PathVariable String workflowType,
                              @RequestParam(defaultValue = "false") boolean force) throws Exception {
        return blueprints.generate(industry, workflowType, force);
    }

    @GetMapping("/blueprints/{industry}/{workflowType}")
    public Blueprint get(@PathVariable String industry, @PathVariable String workflowType) {
        return blueprints.get(industry, workflowType);
    }

    @PatchMapping("/blueprints/{industry}/{workflowType}/items/{itemId}")
    public Blueprint review(@PathVariable String industry, @PathVariable String workflowType,
                            @PathVariable String itemId, @RequestBody Review review) {
        return blueprints.review(industry, workflowType, itemId, review);
    }

    @GetMapping("/blueprints/{industry}/{workflowType}/export.json")
    public Blueprint exportJson(@PathVariable String industry, @PathVariable String workflowType) {
        return blueprints.approvedOnly(industry, workflowType);
    }

    @GetMapping(value = "/blueprints/{industry}/{workflowType}/export.md", produces = "text/markdown")
    public String exportMd(@PathVariable String industry, @PathVariable String workflowType) {
        return blueprints.exportMarkdown(industry, workflowType);
    }

    @PostMapping("/blueprints/{industry}/{workflowType}/gap-check")
    public GapReport gapCheck(@PathVariable String industry, @PathVariable String workflowType, @RequestBody GapRequest req) {
        return gaps.check(industry, workflowType, req);
    }

    @GetMapping("/eval/{industry}/{workflowType}")
    public EvalReport eval(@PathVariable String industry, @PathVariable String workflowType) {
        return evaluator.evaluate(industry, workflowType);
    }

    /** Every error returns {"message": ...} so the UI can show it. */
    @ExceptionHandler(Exception.class)
    public org.springframework.http.ResponseEntity<java.util.Map<String, String>> error(Exception e) {
        Throwable t = e;
        while ((t instanceof java.util.concurrent.ExecutionException || t instanceof java.util.concurrent.CompletionException)
                && t.getCause() != null) t = t.getCause();
        var status = t instanceof org.springframework.web.server.ResponseStatusException r ? r.getStatusCode()
                : org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;
        String msg = t instanceof org.springframework.web.server.ResponseStatusException r ? r.getReason() : t.getMessage();
        if (status.is5xxServerError()) org.slf4j.LoggerFactory.getLogger(Api.class).error("Request failed", t);
        return org.springframework.http.ResponseEntity.status(status).body(java.util.Map.of("message", msg == null ? t.toString() : msg));
    }
}
