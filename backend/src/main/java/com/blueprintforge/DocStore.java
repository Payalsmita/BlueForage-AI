package com.blueprintforge;

import com.blueprintforge.Models.DocMeta;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.regex.Pattern;

/** Source documents live in docs/ with a manifest.csv carrying their metadata. */
@Component
public class DocStore {
    static final Pattern SLUG = Pattern.compile("[A-Za-z0-9-]{1,64}");
    private final Path dir;

    public DocStore(@Value("${blueprint.docs-dir}") String dir) {
        this.dir = Path.of(dir);
    }

    // ponytail: naive CSV split, no quoted fields; switch to a CSV lib if metadata ever contains commas
    public synchronized List<DocMeta> list() {
        try {
            return Files.readAllLines(dir.resolve("manifest.csv")).stream()
                    .skip(1).filter(l -> !l.isBlank())
                    .map(l -> l.split(",", -1))
                    .map(c -> new DocMeta(c[0].trim(), c[1].trim(), c[2].trim(), c[3].trim(), c[4].trim()))
                    .toList();
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read " + dir.resolve("manifest.csv"), e);
        }
    }

    public List<DocMeta> group(String industry, String workflowType) {
        return list().stream()
                .filter(d -> d.industry().equals(industry) && d.workflowType().equals(workflowType))
                .toList();
    }

    public DocMeta get(String docId) {
        return list().stream().filter(d -> d.docId().equals(docId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown doc " + docId));
    }

    public String text(DocMeta d) {
        try {
            return Files.readString(dir.resolve(d.filename()));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot read " + d.filename(), e);
        }
    }

    /** Only .md/.txt for now. PDF/DOCX: add Apache Tika when real docs arrive. */
    public synchronized DocMeta add(String docId, String industry, String geography, String workflowType,
                                    String originalName, byte[] content) throws IOException {
        for (String v : List.of(docId, industry, geography, workflowType))
            if (!SLUG.matcher(v).matches())
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Metadata must match " + SLUG + ": " + v);
        String lower = originalName == null ? "" : originalName.toLowerCase();
        String ext = lower.endsWith(".md") ? ".md" : lower.endsWith(".txt") ? ".txt" : null;
        if (ext == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only .md and .txt are supported");
        if (list().stream().anyMatch(d -> d.docId().equals(docId)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Doc already exists: " + docId);

        String filename = docId + ext; // never trust the uploaded filename for paths
        Files.write(dir.resolve(filename), content);
        Files.writeString(dir.resolve("manifest.csv"),
                String.join(",", docId, filename, industry, geography, workflowType) + "\n",
                StandardOpenOption.APPEND);
        return new DocMeta(docId, filename, industry, geography, workflowType);
    }
}
