package com.blueprintforge;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.info.Info;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@OpenAPIDefinition(info = @Info(title = "BlueprintForge AI API", version = "0.3",
        description = "Turns past recruiting implementations into evidence-backed industry blueprints. "
                + "Errors return {\"message\": \"...\"}. Calls marked (LLM) use the configured OpenAI-compatible endpoint."))
@SpringBootApplication
public class BlueprintforgeApplication {

	public static void main(String[] args) {
		SpringApplication.run(BlueprintforgeApplication.class, args);
	}

}
