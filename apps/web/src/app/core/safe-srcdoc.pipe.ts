import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { rewriteRemainingCids, wrapEmailHtml } from './email-body';
import { environment } from '../../environments/environment';

/** Pure pipe so srcdoc is stable across change detection (avoids iframe reload loops). */
@Pipe({ name: 'safeSrcdoc' })
export class SafeSrcdocPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(
    bodyHtml: string | null | undefined,
    blockRemoteImages = true,
    attachments: { id: string; name: string; kind?: string; mimeType?: string }[] = [],
    /** When true (default), hide quoted reply history in this card. */
    trimQuotedHistory = true,
    /** Blend HTML into chat bubble (transparent surface). */
    chatSurface = true,
  ): SafeHtml {
    const attachBase = `${environment.coreBaseUrl}/attachments`;
    const withCids = rewriteRemainingCids(
      bodyHtml ?? '',
      attachments,
      attachBase,
    );
    const doc = wrapEmailHtml(withCids, {
      blockRemoteImages,
      trimQuotedHistory,
      chatSurface,
    });
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  }
}
