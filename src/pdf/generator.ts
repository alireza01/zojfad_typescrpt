// src/pdf/generator.ts
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import autoTable from "https://esm.sh/jspdf-autotable@3.8.2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { getUserSchedule } from "../supabase/db.ts";
import { getVazirFont } from "./font.ts";
import { processTextForPDF } from "./textProcessor.ts";
import { ENGLISH_WEEKDAYS, PERSIAN_WEEKDAYS } from "../config.ts";
import { log } from "../utils/misc.ts";
import type { UserSchedule, Schedule } from "../types.ts";

/**
 * Generates a beautiful, correctly formatted PDF of a user's weekly schedule.
 * This function handles RTL layout and proper Persian text shaping.
 * @param userId - The ID of the user.
 * @param fullName - The full name of the user for the PDF header.
 * @returns A Uint8Array buffer of the generated PDF file.
 */
export async function generateSchedulePDF(userId: number, fullName: string): Promise<Uint8Array> {
    log("INFO", `[PDF] Starting PDF generation for user ${userId} (${fullName})`);
    
    const doc = new jsPDF({ orientation: "landscape", format: "a4" });
    const fontBuffer = await getVazirFont();
    if (!fontBuffer) {
        throw new Error("Vazir font not available for PDF generation.");
    }
        
    // Add font to the PDF
    const base64Font = encodeBase64(fontBuffer);
    doc.addFileToVFS('Vazirmatn-Regular.ttf', base64Font);
    doc.addFont('Vazirmatn-Regular.ttf', 'Vazir', 'normal');
    doc.setFont('Vazir');
    doc.setR2L(true); // Enable Right-to-Left mode for the entire document
    
    const schedule = await getUserSchedule(userId);
    const weekTypes = [
        { label: "فرد", emoji: "🟣", data: schedule.odd_week_schedule },
        { label: "زوج", emoji: "🟢", data: schedule.even_week_schedule }
    ];
    
    for (const [index, week] of weekTypes.entries()) {
        if (index > 0) doc.addPage();
        doc.setR2L(true);
        doc.setFont('Vazir');
                
        generatePageForWeek(doc, week.label, week.emoji, fullName, week.data);
    }
        
    log("INFO", `[PDF] Generation complete for user ${userId}.`);
    return new Uint8Array(doc.output('arraybuffer'));
}

function generatePageForWeek(doc: jsPDF, weekLabel: string, weekEmoji: string, fullName: string, scheduleData: Schedule) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    
    // --- Header ---
    doc.setFontSize(18);
    doc.text(processTextForPDF("برنامه هفتگی"), pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(12);
    doc.text(processTextForPDF(`نام: ${fullName}`), pageWidth / 2, 25, { align: "center" });
    doc.setFontSize(14);
    doc.text(processTextForPDF(`هفته ${weekLabel} ${weekEmoji}`), pageWidth / 2, 35, { align: "center" });
    
    // --- Table ---
    const head = [[
        processTextForPDF('کلاس پنجم\n17:00 - 19:00'),
        processTextForPDF('کلاس چهارم\n15:00 - 17:00'),
        processTextForPDF('کلاس سوم\n13:00 - 15:00'),
        processTextForPDF('کلاس دوم\n10:00 - 12:00'),
        processTextForPDF('کلاس اول\n08:00 - 10:00'),
        processTextForPDF('روز')
    ]];
    
    const body = ENGLISH_WEEKDAYS.map((dayKey, index) => {
        const lessons = scheduleData[dayKey] || [];
        const row = ['-', '-', '-', '-', '-', processTextForPDF(PERSIAN_WEEKDAYS[index])];
                
        lessons.forEach(lesson => {
            const startTime = lesson.start_time;
            let slotIndex = -1;
            if (startTime >= '08:00' && startTime < '10:00') slotIndex = 4;
            else if (startTime >= '10:00' && startTime < '12:00') slotIndex = 3;
            else if (startTime >= '13:00' && startTime < '15:00') slotIndex = 2;
            else if (startTime >= '15:00' && startTime < '17:00') slotIndex = 1;
            else if (startTime >= '17:00' && startTime < '19:00') slotIndex = 0;
            
            if (slotIndex !== -1) {
                const lessonText = processTextForPDF(lesson.lesson);
                const locationText = processTextForPDF(lesson.location);
                row[slotIndex] = `${lessonText}\n${locationText}`;
            }
        });
        return row;
    });
    
    autoTable(doc, {
        head,
        body,
        startY: 45,
        theme: 'grid',
        styles: {
            font: 'Vazir',
            fontSize: 9,
            cellPadding: 2,
            halign: 'center',
            valign: 'middle',
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: [220, 220, 220],
            textColor: [0, 0, 0],
            fontSize: 10,
            fontStyle: 'bold',
        },
        columnStyles: {
            // The 'روز' column (visually on the right)
            5: { fontStyle: 'bold', cellWidth: 25 },
        },
        didDrawPage: (data) => {
            // --- Footer ---
            doc.setFontSize(8);
            doc.text("@WeekStatusBot", pageWidth - margin, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
        }
    });
}