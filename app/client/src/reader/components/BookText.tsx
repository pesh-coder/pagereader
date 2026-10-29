import { emphasisParts } from '../emphasis'

export function BookText({
  paragraphs,
  page,
}: {
  paragraphs: string[]
  page?: number
}) {
  return (
    <div className="book-text">
      {paragraphs.map((text, index) => (
        <p key={`${page}-${index}`}>
          {emphasisParts(text).map((part, i) =>
            part.emphasis ? <em key={i}>{part.text}</em> : part.text,
          )}
        </p>
      ))}
    </div>
  )
}
