import React from "react";
import { Box, Text } from "ink";
import { marked } from "marked";
import type { Token, Tokens } from "marked";

interface MarkdownTextProps {
  text: string;
}

export function MarkdownText({ text }: MarkdownTextProps) {
  if (!text) return null;

  const tokens = marked.lexer(text);
  return (
    <Box flexDirection="column">
      {renderTokens(tokens)}
    </Box>
  );
}

function renderTokens(tokens: Token[]): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "code":
        return <CodeBlock key={i} token={token as Tokens.Code} />;
      case "paragraph":
        return (
          <Box key={i}>
            {renderInlineTokens((token as Tokens.Paragraph).tokens)}
          </Box>
        );
      case "list":
        return <ListBlock key={i} token={token as Tokens.List} />;
      case "space":
        return <React.Fragment key={i} />;
      case "heading":
        return (
          <Box key={i}>
            <Text bold>{collectText((token as Tokens.Heading).tokens)}</Text>
          </Box>
        );
      case "blockquote": {
        const bq = token as Tokens.Blockquote;
        return (
          <Box key={i} paddingLeft={1} borderStyle="single" borderColor="gray">
            <Box flexDirection="column">{renderTokens(bq.tokens)}</Box>
          </Box>
        );
      }
      default:
        return <Text key={i}>{token.raw}</Text>;
    }
  });
}

function CodeBlock({ token }: { token: Tokens.Code }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingLeft={1}
      paddingRight={1}
    >
      {token.lang && <Text dimColor>{token.lang}</Text>}
      <Text>{token.text}</Text>
    </Box>
  );
}

function ListBlock({ token }: { token: Tokens.List }) {
  return (
    <Box flexDirection="column">
      {token.items.map((item, i) => (
        <Box key={i}>
          <Text>{token.ordered ? `${i + 1}. ` : "• "}</Text>
          <Box>{renderInlineTokens(item.tokens)}</Box>
        </Box>
      ))}
    </Box>
  );
}

function renderInlineTokens(tokens?: Token[]): React.ReactNode[] {
  if (!tokens) return [];
  const result: React.ReactNode[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    switch (token.type) {
      case "strong":
        result.push(
          <Text key={i} bold>
            {collectText((token as Tokens.Strong).tokens)}
          </Text>,
        );
        break;
      case "em":
        result.push(
          <Text key={i} italic>
            {collectText((token as Tokens.Em).tokens)}
          </Text>,
        );
        break;
      case "codespan":
        result.push(
          <Text key={i} backgroundColor="gray" color="white">
            {(token as Tokens.Codespan).text}
          </Text>,
        );
        break;
      case "text": {
        const textToken = token as Tokens.Text;
        if (textToken.tokens) {
          result.push(...renderInlineTokens(textToken.tokens));
        } else {
          result.push(<Text key={i}>{textToken.text}</Text>);
        }
        break;
      }
      case "link":
        result.push(
          <Text key={i} color="blue">
            {collectText((token as Tokens.Link).tokens)}
          </Text>,
        );
        break;
      default:
        result.push(<Text key={i}>{token.raw}</Text>);
    }
  }
  return result;
}

function collectText(tokens?: Token[]): string {
  if (!tokens) return "";
  let result = "";
  for (const token of tokens) {
    if (token.type === "text") {
      const t = token as Tokens.Text;
      if (t.tokens) {
        result += collectText(t.tokens);
      } else {
        result += t.text;
      }
    } else if ("tokens" in token && (token as { tokens?: Token[] }).tokens) {
      result += collectText((token as { tokens: Token[] }).tokens);
    } else if ("text" in token) {
      result += (token as { text: string }).text;
    }
  }
  return result;
}
