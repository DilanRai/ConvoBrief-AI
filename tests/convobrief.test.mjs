import test from "node:test";
import assert from "node:assert/strict";
import module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

// Register @/* -> ./src/* resolver hook for Node 22 native TypeScript execution
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const rel = specifier.slice(2);
      const baseCandidate = path.join(projectRoot, "src", rel);
      const candidates = [
        baseCandidate,
        `${baseCandidate}.ts`,
        `${baseCandidate}.tsx`,
        path.join(baseCandidate, "index.ts"),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { runConvoBriefValidationSuite } = await import(
  "../src/lib/validation-suite.ts"
);
const { parseConversation } = await import("../src/lib/parser.ts");
const {
  analyzeConversationWithIntelligence,
  answerFollowUpWithIntelligence,
  ExternalProviderError,
  resolveActiveProvider,
} = await import("../src/lib/llm-provider.ts");

test("Custom OpenAI-compatible endpoint accepts a full chat-completions URL", () => {
  const provider = resolveActiveProvider({
    preferredProvider: "custom",
    preferredModel: "google/gemma-3-4b-it",
    customBaseUrl: "https://integrate.api.nvidia.com/v1/chat/completions",
    apiKeys: { custom: "test-key" },
  });

  assert.equal(provider.baseUrl, "https://integrate.api.nvidia.com/v1");
});

test("Groq uses a Groq model when the saved model is the generic default", () => {
  const provider = resolveActiveProvider({
    preferredProvider: "auto",
    preferredModel: "gpt-4o-mini",
    customBaseUrl: "https://api.groq.com/openai/v1",
    apiKeys: { custom: "test-key" },
  });

  assert.equal(provider.model, "qwen/qwen3.8-27b");
});

test("Groq provider uses its own key and allows switching model IDs", () => {
  const provider = resolveActiveProvider({
    preferredProvider: "groq",
    preferredModel: "llama-3.3-70b-versatile",
    apiKeys: { groq: "groq-test-key" },
  });

  assert.equal(provider.apiKey, "groq-test-key");
  assert.equal(provider.model, "llama-3.3-70b-versatile");
  assert.equal(provider.baseUrl, "https://api.groq.com/openai/v1");
});

test("NVIDIA provider uses its own key, supported endpoint, and selected model", () => {
  const provider = resolveActiveProvider({
    preferredProvider: "nvidia",
    preferredModel: "google/gemma-3-12b-it",
    apiKeys: { nvidia: "nvidia-test-key" },
  });

  assert.equal(provider.apiKey, "nvidia-test-key");
  assert.equal(provider.model, "google/gemma-3-12b-it");
  assert.equal(provider.baseUrl, "https://integrate.api.nvidia.com/v1");
});

test("NVIDIA .env provider, key, and model override generic account defaults", () => {
  const names = ["LLM_PROVIDER", "NVIDIA_API_KEY", "NVIDIA_MODEL"];
  const previous = new Map(
    names.map((name) => [name, process.env[name]])
  );
  process.env.LLM_PROVIDER = "nvidia";
  process.env.NVIDIA_API_KEY = "nvidia-env-key";
  process.env.NVIDIA_MODEL = "google/gemma-3-12b-it";

  try {
    const provider = resolveActiveProvider({
      preferredProvider: "auto",
      preferredModel: "gpt-4o-mini",
      apiKeys: {
        nvidia: "saved-account-key",
        openai: "saved-openai-key",
      },
    });

    assert.equal(provider.apiKey, "nvidia-env-key");
    assert.equal(provider.model, "google/gemma-3-12b-it");
    assert.equal(provider.baseUrl, "https://integrate.api.nvidia.com/v1");
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("NVIDIA endpoint detection repairs the old NVIDIA base URL and generic model", () => {
  const names = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
  ];
  const previous = new Map(
    names.map((name) => [name, process.env[name]])
  );
  for (const name of names) delete process.env[name];

  try {
    const provider = resolveActiveProvider({
      preferredProvider: "auto",
      preferredModel: "gpt-4o-mini",
      customBaseUrl: "https://ai.api.nvidia.com/v1",
      apiKeys: { custom: "nvidia-test-key" },
    });

    assert.equal(provider.baseUrl, "https://integrate.api.nvidia.com/v1");
    assert.equal(provider.model, "google/gemma-3-4b-it");
    assert.equal(provider.label, "NVIDIA NIM (google/gemma-3-4b-it)");
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("NVIDIA inference 404 explains that catalog visibility may not grant invocation access", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("Not found", { status: 404 });
  try {
    await assert.rejects(
      analyzeConversationWithIntelligence({
        bundle: parseConversation("Alex: Let's review the project timeline."),
        mode: "detailed",
        lengthPreference: "balanced",
        providerConfig: {
          preferredProvider: "nvidia",
          preferredModel: "google/gemma-3-4b-it",
          apiKeys: { nvidia: "nvidia-test-key" },
        },
        requireExternalProvider: true,
      }),
      (error) =>
        error instanceof ExternalProviderError &&
        error.status === 502 &&
        /catalog visibility alone does not guarantee inference access/.test(
          error.message
        )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Local NLP analysis works without calling an external provider", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Local analysis must not call fetch.");
  };
  try {
    const result = await analyzeConversationWithIntelligence({
      bundle: parseConversation("Alex: Let's review the project timeline."),
      mode: "detailed",
      lengthPreference: "balanced",
      providerConfig: { preferredProvider: "local" },
    });

    assert.match(result.providerUsed, /Hybrid NLP Engine/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI-powered analysis fails instead of silently falling back to local NLP", async () => {
  await assert.rejects(
    analyzeConversationWithIntelligence({
      bundle: parseConversation("Alex: Let's review the project timeline."),
      mode: "detailed",
      lengthPreference: "balanced",
      providerConfig: { preferredProvider: "local" },
      requireExternalProvider: true,
    }),
    (error) =>
      error instanceof ExternalProviderError &&
      error.status === 400 &&
      /requires a configured AI provider/.test(error.message)
  );
});

test("AI follow-up fails instead of silently falling back to local QA", async () => {
  await assert.rejects(
    answerFollowUpWithIntelligence({
      question: "What was decided?",
      messages: [],
      structuredResult: {},
      providerConfig: { preferredProvider: "local" },
      requireExternalProvider: true,
    }),
    (error) =>
      error instanceof ExternalProviderError &&
      error.status === 400 &&
      /requires a configured AI provider/.test(error.message)
  );
});

test("ConvoBrief AI — Complete 12-Scenario Grounding, File & Security Suite", async (t) => {
  const report = await runConvoBriefValidationSuite();

  for (const tc of report.results) {
    await t.test(`${tc.id}: ${tc.name}`, () => {
      assert.equal(
        tc.passed,
        true,
        `Scenario "${tc.name}" failed: ${tc.assertionSummary}`
      );
    });
  }

  assert.equal(report.totalTests, 12);
  assert.equal(report.passedCount, 12);
  assert.equal(report.allPassed, true);
});
