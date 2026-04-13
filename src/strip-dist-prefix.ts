export function stripDistPrefix(text: string, distName: string): string {
  return text.replaceAll(`./${distName}/`, './').replaceAll(`"${distName}/`, '"');
}
