// src/pdf/textProcessor.ts
// This module contains the logic for correctly shaping Persian text for PDF generation.
// It replaces the old, broken string reversal method with a proper text shaping library.

import { default as fShaper } from 'https://esm.sh/f-shaper@1.0.1';
import { log } from '../utils/misc.ts';

/**
 * Processes a string to make it suitable for rendering in the PDF.
 * - For Persian text, it applies proper text shaping for connected characters.
 * - For non-Persian text, it returns the text as is.
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
            // Use f-shaper to correctly form ligatures and connect letters.
            // Example: 'سلام' -> correctly shaped 'سلام' with connected glyphs.
            return fShaper.shape(inputText);
        } catch (e) {
            log('ERROR', `f-shaper failed for text: "${inputText}"`, e);
            // Fallback for safety, though it will likely look wrong.
            return inputText;
        }
    } else {
        // If no Persian characters, return the original text.
        // This correctly handles numbers, English, and symbols.
        return inputText;
    }
}