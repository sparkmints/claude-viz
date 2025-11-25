import { marked, Renderer } from 'marked';
import { ParsedPlan, PlanSection } from '../types';

/**
 * Parse markdown plan into structured format
 */
export async function parsePlan(markdown: string): Promise<ParsedPlan> {
  const sections: PlanSection[] = [];
  const steps: string[] = [];

  // Extract sections
  const lines = markdown.split('\n');
  let currentSection: PlanSection | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n');
        sections.push(currentSection);
      }

      // Start new section
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      currentSection = {
        level,
        title,
        content: '',
        id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);

      // Extract steps (lines starting with numbers or checkboxes)
      if (line.match(/^\d+\.\s/) || line.match(/^[-*]\s/)) {
        const step = line.replace(/^(\d+\.|-|\*)\s*/, '').trim();
        if (step) {
          steps.push(step);
        }
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n');
    sections.push(currentSection);
  }

  // Convert markdown to HTML with heading IDs
  const renderer = new Renderer();
  renderer.heading = function(text: string, level: number) {
    const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };

  const html = await marked(markdown, { renderer });

  return {
    html,
    sections,
    steps,
  };
}

/**
 * Generate table of contents from sections
 */
export function generateTOC(sections: PlanSection[]): string {
  const toc: string[] = ['<nav class="toc">', '<h3>Table of Contents</h3>', '<ul>'];

  for (const section of sections) {
    const indent = '  '.repeat(section.level - 1);
    toc.push(`${indent}<li><a href="#${section.id}">${section.title}</a></li>`);
  }

  toc.push('</ul>', '</nav>');
  return toc.join('\n');
}
