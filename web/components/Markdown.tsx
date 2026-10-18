import type { ComponentProps, JSX } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

type Tag = keyof JSX.IntrinsicElements;

/** Renders `As` with fixed classes, dropping react-markdown's `node` prop so it never reaches the DOM. */
function styled<T extends Tag>(As: T, className: string, extra: Partial<ComponentProps<T>> = {}) {
  function Styled(props: ComponentProps<T> & ExtraProps) {
    const rest: Record<string, unknown> = { ...props };
    delete rest.node;
    const Comp = As as unknown as React.ElementType;
    return <Comp {...extra} {...rest} className={className} />;
  }
  Styled.displayName = `md-${As}`;
  return Styled;
}

const COMPONENTS: Components = {
  p: styled("p", "my-2 first:mt-0 last:mb-0"),
  a: styled("a", "font-semibold text-primary underline underline-offset-2", { target: "_blank", rel: "noopener noreferrer" }),
  ul: styled("ul", "my-2 list-disc space-y-1 pl-6"),
  ol: styled("ol", "my-2 list-decimal space-y-1 pl-6"),
  h1: styled("h3", "mt-4 mb-2 text-lg font-bold"),
  h2: styled("h3", "mt-4 mb-2 text-lg font-bold"),
  h3: styled("h4", "mt-3 mb-1 font-bold"),
  blockquote: styled("blockquote", "my-2 border-l-4 border-border pl-3 text-muted"),
  pre: styled("pre", "my-3 overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-sm leading-relaxed"),
  code: function Code(props) {
    const { node: _node, className, ...rest } = props;
    void _node;
    // Fenced blocks carry a language-* class (and sit inside <pre>); inline code gets a pill.
    return className ? (
      <code className={`font-mono ${className}`} {...rest} />
    ) : (
      <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.9em]" {...rest} />
    );
  },
  table: function Table(props) {
    const { node: _node, ...rest } = props;
    void _node;
    return (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm" {...rest} />
      </div>
    );
  },
  th: styled("th", "border-b border-border px-2 py-1 text-left font-bold"),
  td: styled("td", "border-b border-border px-2 py-1"),
  img: function Img({ alt }) {
    return <span className="text-muted">[image: {alt}]</span>;
  },
};

/** Safe markdown: raw HTML is skipped and react-markdown's default URL sanitizer applies. */
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`leading-relaxed break-words ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
