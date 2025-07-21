// src/pdf/textProcessor.ts
import { shape } from 'https://esm.sh/arabic-shaper-ts@2.0.1';
import { log } from '../utils/misc.ts';

/**
 * Processes a string to make it suitable for rendering in the PDF.
 * This version uses the 'arabic-shaper-ts' library, which is more reliable.
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
            // Use arabic-shaper-ts to correctly form ligatures and connect letters.
            // This function returns the properly shaped string that jspdf can render.
            return shape(inputText);
        } catch (e) {
            log('ERROR', `arabic-shaper-ts failed for text: "${inputText}"`, e);
            // Fallback for safety, though it will likely look wrong.
            return inputText;
        }
    } else {
        // If no Persian characters, return the original text.
        return inputText;
    }
}