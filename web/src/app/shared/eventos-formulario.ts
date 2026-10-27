export const valorDe = (e: Event): string => (e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
export const marcadoDe = (e: Event): boolean => (e.target as HTMLInputElement).checked;
