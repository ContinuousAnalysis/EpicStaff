export function calcLimit(chunkSize: number) {
    const minChunk = 20;
    const maxChunk = 20000;
    const maxLimit = 100;
    const minLimit = 5;

    const t = (chunkSize - minChunk) / (maxChunk - minChunk);
    const clamped = Math.max(0, Math.min(1, t));

    const buffer = maxLimit - (maxLimit - minLimit) * clamped;

    return Math.round(buffer);
}
