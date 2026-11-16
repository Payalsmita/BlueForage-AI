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
    private final String markitdown;

    public DocStore(@Value("${blueprint.docs-dir}") String dir, @Value("${blueprint.markitdown}") String markitdown) {
        this.dir = Path.of(dir);
        this.markitdown = markitdown;
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

    /** .md/.txt are stored as-is; .pdf/.docx/.pptx are converted to Markdown with Microsoft MarkItDown. */
    public synchronized DocMeta add(String docId, String industry, String geography, String workflowType,
                                    String originalName, byte[] content) throws IOException {
        for (String v : List.of(docId, industry, geography, workflowType))
            if (!SLUG.matcher(v).matches())
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Metadata must match " + SLUG + ": " + v);
        String lower = originalName == null ? "" : originalName.toLowerCase();
        String ext = lower.endsWith(".md") ? ".md" : lower.endsWith(".txt") ? ".txt" : null;
        String convertFrom = lower.matches(".*\\.(pdf|docx|pptx)$") ? lower.substring(lower.lastIndexOf('.')) : null;
        if (ext == null && convertFrom == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Supported files: .md, .txt, .pdf, .docx, .pptx");
        if (list().stream().anyMatch(d -> d.docId().equals(docId)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Doc already exists: " + docId);

        if (convertFrom != null) {
            content = toMarkdown(convertFrom, content);
            ext = ".md";
        }
        String filename = docId + ext; // never trust the uploaded filename for paths
        Files.write(dir.resolve(filename), content);
        Files.writeString(dir.resolve("manifest.csv"),
                String.join(",", docId, filename, industry, geography, workflowType) + "\n",
                StandardOpenOption.APPEND);
        return new DocMeta(docId, filename, industry, geography, workflowType);
    }

    /** Runs the MarkItDown CLI (pip/uv: markitdown[pdf,docx,pptx]) on a temp copy of the upload. */
    byte[] toMarkdown(String ext, byte[] content) throws IOException {
        Path in = Files.createTempFile("bf-upload", ext), out = Files.createTempFile("bf-upload", ".md");
        try {
            Files.write(in, content);
            Process p;
            try {
                p = new ProcessBuilder(markitdown, in.toString())
                        .redirectOutput(out.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            } catch (IOException e) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "MarkItDown not found. Install it: uv tool install 'markitdown[pdf,docx,pptx]' (or pip), or set MARKITDOWN_CMD");
            }
            if (!p.waitFor(120, java.util.concurrent.TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Document conversion timed out");
            }
            byte[] md = Files.readAllBytes(out);
            if (p.exitValue() != 0 || new String(md).isBlank())
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Could not extract text from the document (scanned PDF or unsupported content?)");
            return md;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        } finally {
            Files.deleteIfExists(in);
            Files.deleteIfExists(out);
        }
    }
}
