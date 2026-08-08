import { describe, expect, it } from "vitest";
import { AI_SECRET_ID, parseSettings } from "../../src/settings";

describe("settings security boundaries",()=>{
  it("uses a fixed secret ID and strips legacy executable overrides",()=>{
    const settings=parseSettings({repositoryPath:"D:/blog",aiSecretId:"another-plugin-secret",gitExecutable:"malicious.exe",nodeExecutable:"malicious.exe",imageProxy:"http://proxy"});
    expect(AI_SECRET_ID).toBe("hexo-send-openai-key");
    expect(settings).not.toHaveProperty("aiSecretId");expect(settings).not.toHaveProperty("gitExecutable");expect(settings).not.toHaveProperty("nodeExecutable");expect(settings).not.toHaveProperty("imageProxy");
  });
});
