export const DESIGN_CAPTURE_SCRIPT = `(() => {
  const root = document.body;
  if (!root) return { url: location.href, title: document.title, browserEngine: 'chromium', sourceRevision: document.documentElement.getAttribute('data-t3-source-revision') || undefined, stateFixture: location.href, viewportWidth: innerWidth, viewportHeight: innerHeight, nodes: [] };
  const rootRect = root.getBoundingClientRect();
  const nodes = [];
  let truncated = false;
  let nextId = 0;
  const animationByTarget = new Map();
  for (const animation of document.getAnimations().slice(0, 256)) {
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || !effect.target || effect.pseudoElement) continue;
    animationByTarget.set(effect.target, animationByTarget.has(effect.target) ? null : animation);
  }
  const bounded = (value, min, max) => typeof value === 'number' && value >= min && value <= max;
  const isTranslation = (matrix) => matrix.is2D && matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1;
  const readTranslation = (value, element) => {
    if (value === 'none') return [0, 0];
    try {
      const matrix = new DOMMatrixReadOnly(value);
      return isTranslation(matrix) ? [matrix.e, matrix.f] : undefined;
    } catch {
      const percentage = /^translate([xy])\\((-?\\d+(?:\\.\\d+)?)%\\)$/iu.exec(value);
      if (!percentage || !(element instanceof HTMLElement)) return undefined;
      const isHorizontal = percentage[1].toLowerCase() === 'x';
      const fraction = Number(percentage[2]) / 100;
      return isHorizontal ? [fraction * element.offsetWidth, 0] : [0, fraction * element.offsetHeight];
    }
  };
  const hasCenteredOrigin = (element, style) => {
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    const [x, y, z = 0] = style.transformOrigin.split(' ').map((value) => Number.parseFloat(value));
    const matchesCssBox = element instanceof HTMLElement
      ? Math.abs(width - element.offsetWidth) <= 0.5 && Math.abs(height - element.offsetHeight) <= 0.5
      : element instanceof SVGSVGElement && !element.ownerSVGElement;
    return matchesCssBox && width > 0 && height > 0 && z === 0 &&
      Math.abs(x - width / 2) <= 0.01 && Math.abs(y - height / 2) <= 0.01;
  };
  const rotationAngle = (value) => {
    if (value === 'none') return 0;
    const degrees = /^rotate\\((-?(?:\\d+\\.?\\d*|\\.\\d+))deg\\)$/u.exec(value);
    return degrees ? Number(degrees[1]) : NaN;
  };
  const uniformScale = (value) => {
    if (value === 'none') return 1;
    const match = /^scale\\((-?(?:\\d+\\.?\\d*|\\.\\d+))(?:,\\s*(-?(?:\\d+\\.?\\d*|\\.\\d+)))?\\)$/u.exec(value);
    return match && (match[2] === undefined || Number(match[1]) === Number(match[2])) ? Number(match[1]) : NaN;
  };
  const captureMotion = (element, style, matrix, capturedRotation) => {
    const animation = animationByTarget.get(element);
    if (!animation || animation.timeline !== document.timeline || animation.playbackRate !== 1 ||
      animation.playState === 'paused' || animation.playState === 'idle') return undefined;
    if (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) return undefined;
    const effect = animation.effect;
    const timing = effect.getTiming();
    if (effect.composite !== 'replace' || timing.iterationStart !== 0 || timing.endDelay !== 0 ||
      !bounded(timing.duration, 1, 120000) || !bounded(timing.delay, -120000, 120000) ||
      !(timing.iterations === Infinity || bounded(timing.iterations, 0, 1000)) ||
      timing.easing.length > 160) return undefined;
    const frames = effect.getKeyframes();
    if (frames.length < 2 || frames.length > 32 || frames[0].computedOffset !== 0 || frames.at(-1).computedOffset !== 1) return undefined;
    const properties = new Set(frames.flatMap((frame) => Object.keys(frame)));
    if ([...properties].some((property) => !['offset', 'computedOffset', 'easing', 'composite', 'opacity', 'transform'].includes(property))) return undefined;
    const hasOpacity = properties.has('opacity');
    const hasTransform = properties.has('transform');
    if (!hasOpacity && !hasTransform) return undefined;
    let transformKind;
    if (hasTransform) {
      if (!matrix.is2D || style.transformBox === 'content-box' ||
        style.translate !== 'none' || style.rotate !== 'none' || style.scale !== 'none') return undefined;
      const explicit = frames.map((frame) => frame.transform)
        .filter((value) => typeof value === 'string' && value !== 'none');
      if (explicit.length && explicit.every((value) => value.startsWith('rotate('))) {
        const tolerance = 0.00001;
        if (matrix.e !== 0 || matrix.f !== 0 || Math.abs(matrix.a - matrix.d) > tolerance ||
          Math.abs(matrix.b + matrix.c) > tolerance || Math.abs(matrix.a ** 2 + matrix.b ** 2 - 1) > tolerance ||
          !hasCenteredOrigin(element, style)) return undefined;
        transformKind = 'rotation';
      } else if (explicit.length && explicit.every((value) => value.startsWith('scale('))) {
        if (matrix.a !== matrix.d || matrix.a < 0 || matrix.b !== 0 || matrix.c !== 0 ||
          matrix.e !== 0 || matrix.f !== 0 || element.childElementCount ||
          !hasCenteredOrigin(element, style)) return undefined;
        transformKind = 'scale';
      } else {
        if (!isTranslation(matrix)) return undefined;
        transformKind = 'translation';
      }
    }
    const keyframes = [];
    for (const frame of frames) {
      if (!bounded(frame.computedOffset, 0, 1) || frame.easing.length > 160 || !['auto', 'replace'].includes(frame.composite)) return undefined;
      const keyframe = { offset: frame.computedOffset, easing: frame.easing };
      if (hasOpacity) {
        const opacity = Number.parseFloat(frame.opacity);
        if (!bounded(opacity, 0, 1)) return undefined;
        keyframe.opacity = opacity;
      }
      if (transformKind === 'translation') {
        if (typeof frame.transform !== 'string') return undefined;
        const translation = readTranslation(frame.transform, element);
        if (!translation) return undefined;
        const relative = [translation[0] - matrix.e, translation[1] - matrix.f];
        if (!relative.every((value) => bounded(value, -32768, 32768))) return undefined;
        keyframe.translation = relative;
      } else if (transformKind === 'rotation') {
        const rotation = rotationAngle(frame.transform) - capturedRotation;
        if (!bounded(rotation, -3600, 3600)) return undefined;
        keyframe.rotation = rotation;
      } else if (transformKind === 'scale') {
        const scale = uniformScale(frame.transform);
        if (!bounded(scale, 0, 64)) return undefined;
        keyframe.scale = scale;
      }
      keyframes.push(keyframe);
    }
    return {
      keyframes,
      durationMs: timing.duration,
      delayMs: timing.delay,
      iterations: timing.iterations === Infinity ? 'infinite' : timing.iterations,
      direction: timing.direction,
      fill: timing.fill,
      easing: timing.easing,
    };
  };
  const visit = (element, parentId) => {
    if (nodes.length >= 10000) { truncated = true; return; }
    if (element === root || element.hasAttribute('data-t3-design-effect-defs') || ['script','style','link','meta','template','noscript','defs','filter','mask','clippath','symbol','source'].includes(element.tagName.toLowerCase())) return;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const matrix = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    const rotation = Math.round((Math.atan2(matrix.b, matrix.a) * 180 / Math.PI) * 1e6) / 1e6;
    const sourceWidth = Number.parseFloat(style.width) || rect.width;
    const sourceHeight = Number.parseFloat(style.height) || rect.height;
    const opacity = Number.parseFloat(style.opacity);
    const nodeId = String(nextId++);
    const children = Array.from(element.children);
    const text = children.length === 0 ? (element.textContent || '').trim().slice(0, 10000) : null;
    const tag = element.tagName.toLowerCase();
    const vectorPath = (() => {
      if (tag === 'path') return element.getAttribute('d') || undefined;
      if (tag === 'line') {
        const x1 = element.getAttribute('x1') || '0', y1 = element.getAttribute('y1') || '0';
        const x2 = element.getAttribute('x2') || '0', y2 = element.getAttribute('y2') || '0';
        return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
      }
      if (tag === 'rect') {
        const x = element.getAttribute('x') || '0', y = element.getAttribute('y') || '0';
        const width = element.getAttribute('width') || '0', height = element.getAttribute('height') || '0';
        return 'M ' + x + ' ' + y + ' H ' + (Number(x) + Number(width)) + ' V ' + (Number(y) + Number(height)) + ' H ' + x + ' Z';
      }
      if (tag === 'circle' || tag === 'ellipse') {
        const cx = element.getAttribute('cx') || '0', cy = element.getAttribute('cy') || '0';
        const rx = tag === 'circle' ? (element.getAttribute('r') || '0') : (element.getAttribute('rx') || '0');
        const ry = tag === 'circle' ? rx : (element.getAttribute('ry') || '0');
        return 'M ' + (Number(cx) - Number(rx)) + ' ' + cy + ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (Number(cx) + Number(rx)) + ' ' + cy + ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (Number(cx) - Number(rx)) + ' ' + cy + ' Z';
      }
      if (tag === 'polygon' || tag === 'polyline') {
        const values = (element.getAttribute('points') || '').trim().split(/[ ,]+/u).filter(Boolean);
        if (values.length < 4) return undefined;
        const path = values.reduce((result, value, index) => result + (index % 2 === 0 ? (index === 0 ? 'M ' : ' L ') : '') + value + (index % 2 === 0 ? ' ' : ''), '');
        return path + (tag === 'polygon' ? ' Z' : '');
      }
      return undefined;
    })();
    nodes.push({
      nodeId,
      parentId,
      kind: tag === 'img' ? 'image' : vectorPath ? 'vector' : text ? 'text' : 'group',
      name: element.getAttribute('aria-label') || tag,
      text: text || null,
      x: rect.left - rootRect.left + (rect.width - sourceWidth) / 2,
      y: rect.top - rootRect.top + (rect.height - sourceHeight) / 2,
      width: Math.max(1, sourceWidth),
      height: Math.max(1, sourceHeight),
      rotation: rotation || undefined,
      flipX: (determinant < 0 && matrix.a < 0) || undefined,
      flipY: (determinant < 0 && matrix.d < 0) || undefined,
      fill: vectorPath ? (style.fill && style.fill !== 'none' ? style.fill : null) : (style.backgroundColor === 'rgba(0, 0, 0, 0)' ? null : style.backgroundColor),
      backgroundImage: style.backgroundImage && style.backgroundImage !== 'none' ? style.backgroundImage : undefined,
      border: vectorPath ? (style.stroke && style.stroke !== 'none' ? style.stroke : null) : (style.borderColor || null),
      fontFamily: style.fontFamily || null,
      fontSize: Number.parseFloat(style.fontSize) || null,
      fontWeight: Number.parseInt(style.fontWeight, 10) || null,
      fontStyle: style.fontStyle,
      lineHeight: Number.parseFloat(style.lineHeight) || null,
      letterSpacing: Number.parseFloat(style.letterSpacing) || null,
      textDecorationLine: style.textDecorationLine,
      textTransform: style.textTransform,
      fontVariantCaps: style.fontVariantCaps,
      fontFeatureSettings: style.fontFeatureSettings || undefined,
      fontVariationSettings: style.fontVariationSettings || undefined,
      textWrapStyle: style.textWrap || undefined,
      textAlign: style.textAlign,
      textIndent: Number.parseFloat(style.textIndent) || undefined,
      textOverflow: style.textOverflow || undefined,
      maxLines: Number.parseInt(style.webkitLineClamp || '', 10) || undefined,
      color: style.color || null,
      opacity: Number.isFinite(opacity) ? opacity : 1,
      motion: captureMotion(element, style, matrix, rotation),
      mixBlendMode: style.mixBlendMode || undefined,
      borderRadius: Number.parseFloat(style.borderTopLeftRadius) || 0,
      clipContent: style.overflowX !== 'visible' || style.overflowY !== 'visible',
      boxShadow: style.boxShadow,
      filter: style.filter,
      backdropFilter: style.backdropFilter,
      designEffects: element.getAttribute('data-t3-design-effects') || undefined,
      ...(tag === 'img' ? { assetUrl: element.currentSrc || element.src || undefined, assetLoaded: element.complete && element.naturalWidth > 0 || undefined } : {}),
      ...(vectorPath ? { vectorPath, vectorClosed: /z\\s*$/iu.test(vectorPath), vectorStrokeWidth: Number.parseFloat(style.strokeWidth) || undefined, vectorFillOpacity: Number.parseFloat(style.fillOpacity) || undefined, vectorStrokeOpacity: Number.parseFloat(style.strokeOpacity) || undefined, vectorStrokeCap: style.strokeLinecap || undefined, vectorStrokeJoin: style.strokeLinejoin || undefined } : {}),
    });
    for (const child of children) visit(child, nodeId);
  };
  for (const child of Array.from(root.children)) visit(child, null);
  return { url: location.href, title: document.title, browserEngine: 'chromium', sourceRevision: document.documentElement.getAttribute('data-t3-source-revision') || undefined, stateFixture: location.href, viewportWidth: innerWidth, viewportHeight: innerHeight, truncated: truncated || undefined, nodes };
})()`;
