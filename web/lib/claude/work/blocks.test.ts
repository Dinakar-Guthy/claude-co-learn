import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { codeResult, describeCode, fileIdsFromContent, MAX_OUTPUT_CHARS, transcriptFromContent } from "./blocks";
import { bash, bashResult, text } from "./testing";

describe("describeCode", () => {
  it("extracts python from a heredoc", () => {
    const cmd = "python3 << 'EOF'\nimport pandas as pd\nprint(1)\nEOF";
    expect(describeCode("bash_code_execution", { command: cmd })).toEqual({ language: "python", code: "import pandas as pd\nprint(1)" });
  });

  it("labels other python invocations as python and shows the full command", () => {
    expect(describeCode("bash_code_execution", { command: "python train.py" })).toEqual({ language: "python", code: "python train.py" });
    expect(describeCode("bash_code_execution", { command: "cd /tmp && python3 -c 'print(1)'" }).language).toBe("python");
  });

  it("labels shell commands as bash", () => {
    expect(describeCode("bash_code_execution", { command: "ls -la" })).toEqual({ language: "bash", code: "ls -la" });
    expect(describeCode("bash_code_execution", { command: "pip install pythonic" }).language).toBe("bash");
  });

  it("describes text editor operations as file", () => {
    expect(describeCode("text_editor_code_execution", { command: "create", path: "a.py", file_text: "x = 1" })).toEqual({
      language: "file",
      code: "# create a.py\nx = 1",
    });
    expect(describeCode("text_editor_code_execution", { command: "view", path: "a.py" }).code).toBe("# view a.py");
    expect(describeCode("text_editor_code_execution", { command: "str_replace", path: "a.py", old_str: "1", new_str: "2" }).code).toBe(
      "# edit a.py\n- 1\n+ 2",
    );
  });
});

describe("codeResult", () => {
  it("maps bash results and output files", () => {
    expect(codeResult(bashResult("t1", "hi", ["file_1"]))).toEqual({ toolUseId: "t1", stdout: "hi", stderr: "", returnCode: 0, fileIds: ["file_1"] });
  });

  it("maps bash errors", () => {
    const block = { type: "bash_code_execution_tool_result", tool_use_id: "t1", content: { type: "bash_code_execution_tool_result_error", error_code: "execution_time_exceeded" } } as Anthropic.Beta.BetaContentBlock;
    expect(codeResult(block)).toMatchObject({ returnCode: 1, stderr: expect.stringContaining("execution_time_exceeded") });
  });

  it("maps text editor results", () => {
    const view = { type: "text_editor_code_execution_tool_result", tool_use_id: "t2", content: { type: "text_editor_code_execution_view_result", content: "abc", file_type: "text", num_lines: 1, start_line: 1, total_lines: 1 } } as Anthropic.Beta.BetaContentBlock;
    expect(codeResult(view)).toMatchObject({ toolUseId: "t2", stdout: "abc", returnCode: 0 });
    const create = { type: "text_editor_code_execution_tool_result", tool_use_id: "t3", content: { type: "text_editor_code_execution_create_result", is_file_update: false } } as Anthropic.Beta.BetaContentBlock;
    expect(codeResult(create)?.stdout).toBe("File created.");
  });

  it("truncates huge output", () => {
    const r = codeResult(bashResult("t1", "x".repeat(MAX_OUTPUT_CHARS + 10)));
    expect(r!.stdout.length).toBeLessThan(MAX_OUTPUT_CHARS + 40);
    expect(r!.stdout).toContain("truncated");
  });

  it("ignores other blocks", () => {
    expect(codeResult(text("hi"))).toBeNull();
  });
});

describe("transcriptFromContent", () => {
  it("builds text and code items with stable ids", () => {
    const run = bash("python3 -c 'print(0.15)'", "srv_1");
    const content = [text("Loading."), run, bashResult("srv_1", "0.15\n", ["f1"]), text(""), text("Churn is 15%.")];
    expect(transcriptFromContent("msg_9", content)).toEqual([
      { kind: "assistant_text", id: "msg_9:0", text: "Loading." },
      { kind: "code_run", id: "srv_1", language: "python", code: "python3 -c 'print(0.15)'", stdout: "0.15\n", stderr: "", returnCode: 0, fileIds: ["f1"] },
      { kind: "assistant_text", id: "msg_9:4", text: "Churn is 15%." },
    ]);
    expect(fileIdsFromContent(content)).toEqual(["f1"]);
  });
});
