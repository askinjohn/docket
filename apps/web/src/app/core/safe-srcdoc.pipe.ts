import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import { wrapEmailHtml } from './email-body';

/** Pure pipe so srcdoc is stable across change detection (avoids iframe reload loops). */
@Pipe({ name: 'safeSrcdoc' })
export class SafeSrcdocPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(bodyHtml: string | null | undefined): SafeHtml {
    const doc = wrapEmailHtml(bodyHtml ?? '');
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  }
}
