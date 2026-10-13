import { highlightSegments } from '../lib/search.js';

/** Text with search matches wrapped in <mark>. Plain text only: no HTML is ever interpreted. */
export default function Highlight({ text, terms }) {
  return highlightSegments(text, terms).map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>));
}
