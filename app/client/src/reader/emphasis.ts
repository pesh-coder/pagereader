export interface TextPart {
  text: string
  emphasis: boolean
}

// Gutenberg's _word or phrase_ convention only at word boundaries. Literal
// underscores in identifiers, unmatched delimiters and HTML remain plain text.
export function emphasisParts(text: string): TextPart[] {
  const parts: TextPart[] = []
  const pattern =
    /(^|[^\p{L}\p{N}_])_([^_\s](?:[^_]*?[^_\s])?)_(?=$|[^\p{L}\p{N}_])/gu
  let previous = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[1].length
    if (start > previous)
      parts.push({ text: text.slice(previous, start), emphasis: false })
    parts.push({ text: match[2], emphasis: true })
    previous = match.index! + match[0].length
  }
  if (previous < text.length)
    parts.push({ text: text.slice(previous), emphasis: false })
  return parts
}
