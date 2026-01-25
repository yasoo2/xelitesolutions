/**
 * Formats a number using Euro-style formatting (dots for thousands, commas for decimals).
 * Example: 125867.45 -> 125.867,45
 */
export const formatNumber = (value: number | string): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0';

    return num.toLocaleString('de-DE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
};
