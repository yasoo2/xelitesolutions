/**
 * Advanced Browser Interactions
 * =============================
 * 
 * نظام متقدم للتفاعلات الطبيعية والموشر الذكي
 * يحاكي سلوك الإنسان الحقيقي
 */

import { EventEmitter } from 'events';
import { Page } from 'playwright';

/**
 * بنية التفاعل
 */
export interface Interaction {
  type: 'click' | 'hover' | 'scroll' | 'type' | 'select' | 'drag' | 'focus' | 'blur';
  target: string;
  value?: string;
  duration?: number;
  delay?: number;
  timestamp: number;
}

/**
 * بنية الحركة الطبيعية
 */
export interface NaturalMovement {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  duration: number;
  curve: 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier';
  jitter: number; // درجة الارتجاج الطبيعية
}

/**
 * نظام التفاعلات المتقدمة
 */
export class AdvancedInteractionSystem extends EventEmitter {
  private interactions: Interaction[] = [];
  private mouseVelocity: { x: number; y: number } = { x: 0, y: 0 };
  private lastMousePosition: { x: number; y: number } = { x: 0, y: 0 };
  private interactionDelay: number = 100; // تأخير طبيعي بين التفاعلات
  private humanBehavior: boolean = true; // محاكاة السلوك البشري

  constructor() {
    super();
  }

  /**
   * حركة موشر طبيعية مع منحنى بيزيه
   */
  async naturalMouseMove(
    page: Page,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    duration: number = 500,
    onMove?: (x: number, y: number) => void
  ): Promise<void> {
    this.emit('log', `🖱️ Natural mouse move from (${startX}, ${startY}) to (${endX}, ${endY})`);

    // Create a control point for the Bezier curve to make the path non-linear
    // The control point is offset from the midpoint.
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const offset = 30 + Math.random() * 50;
    const cpX = midX + (Math.random() - 0.5) * offset;
    const cpY = midY + (Math.random() - 0.5) * offset;

    const steps = Math.ceil(duration / 16); // ~60 FPS

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;

      // Easing t for a human-like acceleration/deceleration
      const easedT = this.easeInOutCubic(t);

      // Calculate position on Quadratic Bezier curve
      const pos = this.getBezierPoint(easedT, { x: startX, y: startY }, { x: cpX, y: cpY }, { x: endX, y: endY });

      // Add micro-jitter (subtle muscle tremor)
      const jitterX = this.humanBehavior ? (Math.random() - 0.5) * 1.5 : 0;
      const jitterY = this.humanBehavior ? (Math.random() - 0.5) * 1.5 : 0;

      const currentX = pos.x + jitterX;
      const currentY = pos.y + jitterY;

      this.mouseVelocity = {
        x: currentX - this.lastMousePosition.x,
        y: currentY - this.lastMousePosition.y
      };

      this.lastMousePosition = { x: currentX, y: currentY };

      try {
        await page.mouse.move(currentX, currentY);
        if (onMove) onMove(currentX, currentY);
      } catch (e) { }

      this.emit('mouse-move', {
        x: currentX,
        y: currentY,
        velocity: this.mouseVelocity,
        progress: easedT
      });

      // Variable sleep to avoid perfectly uniform timing
      await this.sleep(14 + Math.random() * 4);
    }

    this.emit('log', `✅ اكتملت الحركة الطبيعية`);
  }

  /**
   * نقر طبيعي مع تأخير
   */
  async naturalClick(
    page: Page,
    selector: string,
    x: number,
    y: number,
    options: {
      delay?: number;
      doubleClick?: boolean;
      rightClick?: boolean;
    } = {}
  ): Promise<void> {
    const { delay = 100, doubleClick = false, rightClick = false } = options;

    this.emit('log', `🖱️ نقر طبيعي على ${selector}`);

    // Move execution
    await this.naturalMouseMove(
      page,
      this.lastMousePosition.x,
      this.lastMousePosition.y,
      x,
      y,
      300
    );

    // Natural delay before click
    await this.sleep(delay);

    // Actual Playwright click
    try {
      if (rightClick) await page.mouse.click(x, y, { button: 'right' });
      else await page.mouse.click(x, y, { clickCount: doubleClick ? 2 : 1 });
    } catch { }

    this.emit('click', {
      selector,
      x,
      y,
      button: rightClick ? 'right' : 'left',
      doubleClick
    });

    if (doubleClick) {
      await this.sleep(100);
      // Already handled by clickCount above, but for event parity:
      this.emit('click', {
        selector,
        x,
        y,
        button: rightClick ? 'right' : 'left',
        doubleClick: true
      });
    }

    this.interactions.push({
      type: 'click',
      target: selector,
      timestamp: Date.now()
    });

    this.emit('log', `✅ اكتمل النقر الطبيعي`);
  }

  /**
   * كتابة نصية طبيعية مع تأخيرات عشوائية
   */
  async naturalType(
    page: Page,
    selector: string,
    text: string,
    options: {
      minDelay?: number;
      maxDelay?: number;
      typos?: number; // نسبة الأخطاء الطباعية
    } = {}
  ): Promise<void> {
    const { minDelay = 30, maxDelay = 150, typos = 0 } = options;

    this.emit('log', `⌨️ كتابة طبيعية: "${text}"`);

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Random typos simulation
      if (typos > 0 && Math.random() < typos) {
        const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
        try { await page.keyboard.type(wrongChar); } catch { }
        this.emit('type', {
          selector,
          character: wrongChar,
          isTypo: true
        });
        await this.sleep(this.randomDelay(minDelay, maxDelay));

        // Correction
        try { await page.keyboard.press('Backspace'); } catch { }
        this.emit('backspace', { selector });
        await this.sleep(100);
      }

      if (char === '\b') {
        try { await page.keyboard.press('Backspace'); } catch { }
        this.emit('backspace', { selector });
        await this.sleep(this.randomDelay(minDelay, maxDelay));
        continue;
      }
      if (char === '\x7f') {
        try { await page.keyboard.press('Delete'); } catch { }
        this.emit('delete', { selector });
        await this.sleep(this.randomDelay(minDelay, maxDelay));
        continue;
      }

      try { await page.keyboard.type(char); } catch { }
      this.emit('type', {
        selector,
        character: char,
        progress: ((i + 1) / text.length) * 100
      });

      // Random natural delay
      const delay = this.randomDelay(minDelay, maxDelay);
      await this.sleep(delay);
    }

    this.interactions.push({
      type: 'type',
      target: selector,
      value: text,
      timestamp: Date.now()
    });

    this.emit('log', `✅ اكتملت الكتابة الطبيعية`);
  }

  /**
   * التمرير الطبيعي
   */
  async naturalScroll(
    direction: 'up' | 'down',
    amount: number = 300,
    duration: number = 500
  ): Promise<void> {
    this.emit('log', `📜 تمرير طبيعي ${direction === 'down' ? 'لأسفل' : 'لأعلى'}`);

    const steps = Math.ceil(duration / 16);
    const deltaScroll = direction === 'down' ? amount : -amount;

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const easeProgress = this.easeInOutCubic(progress);
      const currentScroll = deltaScroll * easeProgress;

      this.emit('scroll', {
        direction,
        amount: Math.abs(currentScroll),
        progress: easeProgress
      });

      await this.sleep(16);
    }

    this.interactions.push({
      type: 'scroll',
      target: 'window',
      value: direction,
      timestamp: Date.now()
    });

    this.emit('log', `✅ اكتمل التمرير الطبيعي`);
  }

  /**
   * التحويم على عنصر
   */
  async hover(
    page: Page,
    selector: string,
    x: number,
    y: number,
    duration: number = 500
  ): Promise<void> {
    this.emit('log', `🎯 Hovering on ${selector}`);

    // Move to target
    await this.naturalMouseMove(
      page,
      this.lastMousePosition.x,
      this.lastMousePosition.y,
      x,
      y,
      300
    );

    // Dwell
    await this.sleep(duration);

    try { await page.mouse.move(x, y); } catch { } // Ensure Playwright knows we are there

    this.emit('hover', { selector, x, y });

    this.emit('hover', { selector, x, y });

    this.interactions.push({
      type: 'hover',
      target: selector,
      timestamp: Date.now()
    });

    this.emit('log', `✅ اكتمل التحويم`);
  }

  /**
   * السحب والإفلات
   */
  async dragAndDrop(
    page: Page,
    sourceSelector: string,
    targetSelector: string,
    sourceX: number,
    sourceY: number,
    targetX: number,
    targetY: number
  ): Promise<void> {
    this.emit('log', `🔄 Drag from ${sourceSelector} to ${targetSelector}`);

    // Move to source
    await this.naturalMouseMove(
      page,
      this.lastMousePosition.x,
      this.lastMousePosition.y,
      sourceX,
      sourceY,
      300
    );

    // Mouse down
    try { await page.mouse.down(); } catch { }
    this.emit('mouse-down', { selector: sourceSelector });
    await this.sleep(100);

    // Drag to target
    await this.naturalMouseMove(page, sourceX, sourceY, targetX, targetY, 500);

    // Mouse up
    try { await page.mouse.up(); } catch { }
    this.emit('mouse-up', { selector: targetSelector });

    this.interactions.push({
      type: 'drag',
      target: sourceSelector,
      value: targetSelector,
      timestamp: Date.now()
    });

    this.emit('log', `✅ اكتمل السحب والإفلات`);
  }

  /**
   * التركيز على عنصر
   */
  async focus(selector: string): Promise<void> {
    this.emit('log', `🎯 التركيز على ${selector}`);

    this.emit('focus', { selector });

    this.interactions.push({
      type: 'focus',
      target: selector,
      timestamp: Date.now()
    });

    this.emit('log', `✅ تم التركيز`);
  }

  /**
   * إزالة التركيز
   */
  async blur(selector: string): Promise<void> {
    this.emit('log', `❌ إزالة التركيز من ${selector}`);

    this.emit('blur', { selector });

    this.interactions.push({
      type: 'blur',
      target: selector,
      timestamp: Date.now()
    });

    this.emit('log', `✅ تم إزالة التركيز`);
  }

  /**
   * اختيار من قائمة منسدلة
   */
  async selectOption(
    page: Page,
    selector: string,
    optionValue: string,
    x: number,
    y: number
  ): Promise<void> {
    this.emit('log', `📋 Selecting option: ${optionValue}`);

    // Click dropdown
    await this.naturalClick(page, selector, x, y);
    await this.sleep(300);

    // اختيار الخيار
    this.emit('select', { selector, value: optionValue });

    this.interactions.push({
      type: 'select',
      target: selector,
      value: optionValue,
      timestamp: Date.now()
    });

    this.emit('log', `✅ تم الاختيار`);
  }

  /**
   * Calculate point on a quadratic bezier curve
   */
  private getBezierPoint(t: number, p0: { x: number, y: number }, p1: { x: number, y: number }, p2: { x: number, y: number }) {
    return {
      x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
      y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y
    };
  }

  /**
   * منحنى بيزيه للحركة الطبيعية
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * تأخير عشوائي طبيعي
   */
  private randomDelay(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * الانتظار
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * الحصول على سجل التفاعلات
   */
  getInteractionHistory(): Interaction[] {
    return [...this.interactions];
  }

  /**
   * مسح السجل
   */
  clearHistory(): void {
    this.interactions = [];
  }

  /**
   * تعيين تأخير التفاعل
   */
  setInteractionDelay(delay: number): void {
    this.interactionDelay = delay;
  }

  /**
   * تفعيل/تعطيل محاكاة السلوك البشري
   */
  setHumanBehavior(enabled: boolean): void {
    this.humanBehavior = enabled;
  }

  /**
   * الحصول على معلومات الموشر
   */
  getMouseInfo(): any {
    return {
      position: this.lastMousePosition,
      velocity: this.mouseVelocity,
      totalInteractions: this.interactions.length
    };
  }
}

/**
 * نسخة مفردة من نظام التفاعلات
 */
export const advancedInteractions = new AdvancedInteractionSystem();
