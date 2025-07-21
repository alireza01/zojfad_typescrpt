// src/pdf/textProcessor.ts
import reshaper from 'https://esm.sh/arabic-persian-reshaper';
import { log } from '../utils/misc.ts';

/**
 * Processes a string to make it suitable for rendering in the PDF.
 * This version uses the 'arabic-persian-reshaper' library, which is more reliable.
 *
 * @param text The input string.
 * @returns The processed string, ready for the PDF.
 */
export function processTextForPDF(text: any): string {
    // Ensure we are working with a string
    const inputText = String(text || '').trim();

    if (!inputText) {
        return '-'; // Return a dash for empty or null inputs
    }

    // Regular expression to detect if the string contains any Persian/Arabic characters.
    const hasPersian = /[\u0600-\u06FF]/.test(inputText);

    if (hasPersian) {
        try {
            // Use arabic-persian-reshaper to shape the text
            return reshaper.PersianShaper.convertArabic(inputText);
        } catch (e) {
            log('ERROR', `Text shaping failed for text: "${inputText}"`, e);
            // Fallback for safety
            return inputText;
        }
    } else {
        // If no Persian characters, return the original text.
        return inputText;
    }
}