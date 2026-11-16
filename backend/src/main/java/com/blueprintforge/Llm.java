package com.blueprintforge;

import com.openai.client.OpenAIClient;
import com.openai.client.okhttp.OpenAIOkHttpClient;
import com.openai.errors.OpenAIInvalidDataException;
import com.openai.models.chat.completions.ChatCompletion;
import com.openai.models.chat.completions.ChatCompletionCreateParams;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;

/**
 * One structured-output call to any OpenAI-compatible endpoint (OpenAI, Azure OpenAI, LiteLLM, vLLM, Ollama...).
 * Config: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL. The endpoint must support response_format=json_schema.
 */
@Component
public class Llm {
    private final String baseUrl, apiKey, model;
    private OpenAIClient client; // lazy so the app boots without credentials

    public Llm(@Value("${blueprint.llm.base-url}") String baseUrl,
               @Value("${blueprint.llm.api-key}") String apiKey,
               @Value("${blueprint.llm.model}") String model) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.model = model;
    }

    public <T> T structured(Class<T> type, String system, String user) {
        if (model.isBlank() || apiKey.isBlank()) throw new IllegalStateException("Set LLM_API_KEY and LLM_MODEL");
        var params = ChatCompletionCreateParams.builder()
                .model(model)
                .addSystemMessage(system)
                .addUserMessage(user)
                .temperature(0.0) // repeatable extractions
                .responseFormat(type)
                .build();
        // The SDK retries HTTP errors/timeouts; this loop retries 200s with empty or unparseable output.
        RuntimeException last = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                var choice = client().chat().completions().create(params).choices().stream().findFirst()
                        .orElseThrow(() -> new IllegalStateException("No choices in response"));
                choice.message().refusal().ifPresent(r -> { throw new IllegalArgumentException("Model refused: " + r); });
                if (choice.finishReason() == ChatCompletion.Choice.FinishReason.LENGTH)
                    throw new IllegalArgumentException("Model output hit the token limit; input too large");
                var content = choice.message().content();
                if (content.isPresent()) return content.get();
                last = new IllegalStateException("No structured output in response");
            } catch (OpenAIInvalidDataException e) { // malformed JSON from the model
                last = e;
            }
        }
        throw last;
    }

    private synchronized OpenAIClient client() {
        if (client == null) client = OpenAIOkHttpClient.builder().baseUrl(baseUrl).apiKey(apiKey)
                .timeout(Duration.ofSeconds(120)) // a hung request fails fast and is retried
                .maxRetries(4)                    // SDK backs off on 429/5xx/timeouts
                .build();
        return client;
    }
}
