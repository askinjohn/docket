import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { prepareChatBubbleHtml } from './email-body';
import { environment } from '../../environments/environment';

/**
 * Sanitized HTML fragment for in-bubble rich chat (code, tables, images).
 * Always sanitize before bypass — never pass raw mail HTML.
 */
@Pipe({ name: 'safeChatHtml' })
export class SafeChatHtmlPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(
    bodyHtml: string | null | undefined,
    blockRemoteImages = true,
    attachments: { id: string; name: string; kind?: string; mimeType?: string }[] = [],
    trimQuotedHistory = true,
  ): SafeHtml {
    const html = prepareChatBubbleHtml(bodyHtml ?? '', {
      blockRemoteImages,
      trimQuotedHistory,
      attachments,
      attachBaseUrl: `${environment.coreBaseUrl}/attachments`,
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }
}
