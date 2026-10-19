import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { codeResult, describeCode, dropOrphanServerToolUses, fileIdsFromContent, MAX_OUTPUT_CHARS, serverResultIds, transcriptFromContent } from "./blocks";
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

describe("dropOrphanServerToolUses", () => {
  it("drops server calls without a result and keeps everything else", () => {
    const content = [bash("ls", "srv_1"), bashResult("srv_1", "x\n"), { type: "tool_use", id: "toolu_1", name: "learning_moment", input: {} } as Anthropic.Beta.BetaContentBlock, bash("pwd", "srv_2")];
    const r = dropOrphanServerToolUses(content, new Set(serverResultIds(content)));
    expect(r.dropped).toEqual(["srv_2"]);
    expect(r.content).toEqual(content.slice(0, 3));
  });

  it("returns the same array when nothing is dropped, and ignores client tool_result ids", () => {
    const content = [bash("ls", "srv_1"), bashResult("srv_1", "x\n")];
    expect(dropOrphanServerToolUses(content, new Set(["srv_1"])).content).toBe(content);
    expect(serverResultIds([{ type: "tool_result", tool_use_id: "toolu_1" } as never])).toEqual([]);
  });
});

describe("transcriptFromContent", () => {
  it("builds text and code items with stable ids", () => {
    const run = bash("python3 -c 'print(0.15)'", "srv_1");
    const content = [text("Loading."), run, bashResult("srv_1", "0.15\n", ["f1"]), text(""), text("Churn is 15%.")];
    expect(transcriptFromContent("msg_9", content)).toEqual([
      { kind: "assistant_text", id: "msg_9:0", text: "Loading." },
      { kind: "code_run", id: "srv_1", language: "python", code: "python3 -c 'print(0.15)'", stdout: "0.15\n", stderr: "", returnCode: 0, fileIds: ["f1"] },
      { kind: "assistant_text", id: "msg_9:3", text: "Churn is 15%." },
    ]);
    expect(fileIdsFromContent(content)).toEqual(["f1"]);
  });

  it("joins a cited answer's text blocks into one item with numbered sources", () => {
    const cite = (url: string, title: string | null) => ({ type: "web_search_result_location" as const, url, title, cited_text: "x", encrypted_index: "e" });
    const cited = (t: string, ...c: ReturnType<typeof cite>[]) => ({ type: "text", text: t, citations: c }) as Anthropic.Beta.BetaContentBlock;
    const search = { type: "server_tool_use", id: "srv_s", name: "web_search", input: { query: "q" } } as unknown as Anthropic.Beta.BetaContentBlock;
    const content = [
      text("Let me check."),
      search,
      { type: "web_search_tool_result", tool_use_id: "srv_s", content: [] } as unknown as Anthropic.Beta.BetaContentBlock,
      text("Per the docs, "),
      cited("balanced weights reweight classes", cite("https://scikit-learn.org/a", "LogisticRegression")),
      text(" and "),
      cited("shift the scores", cite("https://www.example.com/b", null), cite("https://scikit-learn.org/a", "LogisticRegression")),
      text("."),
    ];
    expect(transcriptFromContent("m", content)).toEqual([
      { kind: "assistant_text", id: "m:0", text: "Let me check." },
      {
        kind: "assistant_text",
        id: "m:3",
        text: "Per the docs, balanced weights reweight classes [1] and shift the scores [2][1].",
        sources: [
          { url: "https://scikit-learn.org/a", title: "LogisticRegression" },
          { url: "https://www.example.com/b", title: "example.com" },
        ],
      },
    ]);
  });
});
