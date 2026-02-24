import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  Clock,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

const VERTEX_SHADER = `
precision highp float;

void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float iTime;
uniform vec3  iResolution;
uniform float animationSpeed;

uniform bool enableTop;
uniform bool enableMiddle;
uniform bool enableBottom;

uniform int topLineCount;
uniform int middleLineCount;
uniform int bottomLineCount;

uniform float topLineDistance;
uniform float middleLineDistance;
uniform float bottomLineDistance;

uniform vec3 topWavePosition;
uniform vec3 middleWavePosition;
uniform vec3 bottomWavePosition;

uniform vec2 iMouse;
uniform bool interactive;
uniform float bendRadius;
uniform float bendStrength;
uniform float bendInfluence;

uniform bool parallax;
uniform float parallaxStrength;
uniform vec2 parallaxOffset;

uniform vec3 lineGradient[8];
uniform int lineGradientCount;

const vec3 BLACK = vec3(0.0);
const vec3 PINK  = vec3(233.0, 71.0, 245.0) / 255.0;
const vec3 BLUE  = vec3(47.0,  75.0, 162.0) / 255.0;

mat2 rotate(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

vec3 background_color(vec2 uv) {
  vec3 col = vec3(0.0);

  float y = sin(uv.x - 0.2) * 0.3 - 0.1;
  float m = uv.y - y;

  col += mix(BLUE, BLACK, smoothstep(0.0, 1.0, abs(m)));
  col += mix(PINK, BLACK, smoothstep(0.0, 1.0, abs(m - 0.8)));
  return col * 0.5;
}

vec3 getLineColor(float t, vec3 baseColor) {
  if (lineGradientCount <= 0) {
    return baseColor;
  }

  vec3 gradientColor;

  if (lineGradientCount == 1) {
    gradientColor = lineGradient[0];
  } else {
    float clampedT = clamp(t, 0.0, 0.9999);
    float scaled = clampedT * float(lineGradientCount - 1);
    int idx = int(floor(scaled));
    float f = fract(scaled);
    int idx2 = min(idx + 1, lineGradientCount - 1);

    vec3 c1 = lineGradient[idx];
    vec3 c2 = lineGradient[idx2];

    gradientColor = mix(c1, c2, f);
  }

  return gradientColor * 0.5;
}

float wave(vec2 uv, float offset, vec2 screenUv, vec2 mouseUv, bool shouldBend) {
  float time = iTime * animationSpeed;

  float x_offset   = offset;
  float x_movement = time * 0.1;
  float amp        = sin(offset + time * 0.2) * 0.3;
  float y          = sin(uv.x + x_offset + x_movement) * amp;

  if (shouldBend) {
    vec2 d = screenUv - mouseUv;
    float influence = exp(-dot(d, d) * bendRadius);
    float bendOffset = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
    y += bendOffset;
  }

  float m = uv.y - y;
  return 0.0175 / max(abs(m) + 0.01, 1e-3) + 0.01;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 baseUv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  baseUv.y *= -1.0;

  if (parallax) {
    baseUv += parallaxOffset;
  }

  vec3 col = vec3(0.0);

  vec3 b = lineGradientCount > 0 ? vec3(0.0) : background_color(baseUv);

  vec2 mouseUv = vec2(0.0);
  if (interactive) {
    mouseUv = (2.0 * iMouse - iResolution.xy) / iResolution.y;
    mouseUv.y *= -1.0;
  }

  if (enableBottom) {
    for (int i = 0; i < bottomLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(bottomLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = bottomWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      col += lineCol * wave(
        ruv + vec2(bottomLineDistance * fi + bottomWavePosition.x, bottomWavePosition.y),
        1.5 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.2;
    }
  }

  if (enableMiddle) {
    for (int i = 0; i < middleLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(middleLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = middleWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      col += lineCol * wave(
        ruv + vec2(middleLineDistance * fi + middleWavePosition.x, middleWavePosition.y),
        2.0 + 0.15 * fi,
        baseUv,
        mouseUv,
        interactive
      );
    }
  }

  if (enableTop) {
    for (int i = 0; i < topLineCount; ++i) {
      float fi = float(i);
      float t = fi / max(float(topLineCount - 1), 1.0);
      vec3 lineCol = getLineColor(t, b);

      float angle = topWavePosition.z * log(length(baseUv) + 1.0);
      vec2 ruv = baseUv * rotate(angle);
      ruv.x *= -1.0;
      col += lineCol * wave(
        ruv + vec2(topLineDistance * fi + topWavePosition.x, topWavePosition.y),
        1.0 + 0.2 * fi,
        baseUv,
        mouseUv,
        interactive
      ) * 0.1;
    }
  }

  fragColor = vec4(col, 1.0);
}

void main() {
  vec4 color = vec4(0.0);
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}
`;

const MAX_GRADIENT_STOPS = 8;

type WaveType = 'top' | 'middle' | 'bottom';

type WavePosition = {
  x: number;
  y: number;
  rotate: number;
};

type FloatingLinesUniforms = {
  iTime: { value: number };
  iResolution: { value: Vector3 };
  animationSpeed: { value: number };
  enableTop: { value: boolean };
  enableMiddle: { value: boolean };
  enableBottom: { value: boolean };
  topLineCount: { value: number };
  middleLineCount: { value: number };
  bottomLineCount: { value: number };
  topLineDistance: { value: number };
  middleLineDistance: { value: number };
  bottomLineDistance: { value: number };
  topWavePosition: { value: Vector3 };
  middleWavePosition: { value: Vector3 };
  bottomWavePosition: { value: Vector3 };
  iMouse: { value: Vector2 };
  interactive: { value: boolean };
  bendRadius: { value: number };
  bendStrength: { value: number };
  bendInfluence: { value: number };
  parallax: { value: boolean };
  parallaxStrength: { value: number };
  parallaxOffset: { value: Vector2 };
  lineGradient: { value: Vector3[] };
  lineGradientCount: { value: number };
};

function hexToVec3(hex: string): Vector3 {
  let value = hex.trim();

  if (value.startsWith('#')) {
    value = value.slice(1);
  }

  let r = 255;
  let g = 255;
  let b = 255;

  if (value.length === 3) {
    r = Number.parseInt(value[0] + value[0], 16);
    g = Number.parseInt(value[1] + value[1], 16);
    b = Number.parseInt(value[2] + value[2], 16);
  } else if (value.length === 6) {
    r = Number.parseInt(value.slice(0, 2), 16);
    g = Number.parseInt(value.slice(2, 4), 16);
    b = Number.parseInt(value.slice(4, 6), 16);
  }

  return new Vector3(r / 255, g / 255, b / 255);
}

@Component({
  selector: 'app-floating-lines',
  standalone: true,
  templateUrl: './floating-lines.component.html',
  styleUrl: './floating-lines.component.scss',
})
export class FloatingLinesComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @ViewChild('container', { static: true })
  containerRef!: ElementRef<HTMLDivElement>;

  @Input() linesGradient: string[] | undefined;
  @Input() enabledWaves: WaveType[] = ['top', 'middle', 'bottom'];
  @Input() lineCount: number | number[] = [6];
  @Input() lineDistance: number | number[] = [5];
  @Input() topWavePosition: WavePosition | undefined;
  @Input() middleWavePosition: WavePosition | undefined;
  @Input() bottomWavePosition: WavePosition = { x: 2.0, y: -0.7, rotate: -1 };
  @Input() animationSpeed = 1;
  @Input() interactive = true;
  @Input() bendRadius = 5.0;
  @Input() bendStrength = -0.5;
  @Input() mouseDamping = 0.05;
  @Input() parallax = true;
  @Input() parallaxStrength = 0.2;
  @Input() mixBlendMode = 'screen';

  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: OrthographicCamera | null = null;
  private geometry: PlaneGeometry | null = null;
  private material: ShaderMaterial | null = null;
  private clock: Clock | null = null;
  private uniforms: FloatingLinesUniforms | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private rafId = 0;
  private viewInitialized = false;
  private hasPointerListeners = false;

  private targetMouse = new Vector2(-1000, -1000);
  private currentMouse = new Vector2(-1000, -1000);
  private targetInfluence = 0;
  private currentInfluence = 0;
  private targetParallax = new Vector2(0, 0);
  private currentParallax = new Vector2(0, 0);

  constructor(private readonly ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.initializeScene();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewInitialized) {
      return;
    }

    const shouldRebuild = Object.keys(changes).some(
      (key) => key !== 'mixBlendMode',
    );
    if (shouldRebuild) {
      this.rebuildScene();
    }
  }

  ngOnDestroy(): void {
    this.destroyScene();
  }

  private rebuildScene(): void {
    this.destroyScene();
    this.initializeScene();
  }

  private initializeScene(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const container = this.containerRef.nativeElement;
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    camera.position.z = 1;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const topLineCount = this.enabledWaves.includes('top')
      ? this.getLineCount('top')
      : 0;
    const middleLineCount = this.enabledWaves.includes('middle')
      ? this.getLineCount('middle')
      : 0;
    const bottomLineCount = this.enabledWaves.includes('bottom')
      ? this.getLineCount('bottom')
      : 0;

    const topLineDistance = this.enabledWaves.includes('top')
      ? this.getLineDistance('top') * 0.01
      : 0.01;
    const middleLineDistance = this.enabledWaves.includes('middle')
      ? this.getLineDistance('middle') * 0.01
      : 0.01;
    const bottomLineDistance = this.enabledWaves.includes('bottom')
      ? this.getLineDistance('bottom') * 0.01
      : 0.01;

    const uniforms: FloatingLinesUniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Vector3(1, 1, 1) },
      animationSpeed: { value: this.animationSpeed },
      enableTop: { value: this.enabledWaves.includes('top') },
      enableMiddle: { value: this.enabledWaves.includes('middle') },
      enableBottom: { value: this.enabledWaves.includes('bottom') },
      topLineCount: { value: topLineCount },
      middleLineCount: { value: middleLineCount },
      bottomLineCount: { value: bottomLineCount },
      topLineDistance: { value: topLineDistance },
      middleLineDistance: { value: middleLineDistance },
      bottomLineDistance: { value: bottomLineDistance },
      topWavePosition: {
        value: new Vector3(
          this.topWavePosition?.x ?? 10.0,
          this.topWavePosition?.y ?? 0.5,
          this.topWavePosition?.rotate ?? -0.4,
        ),
      },
      middleWavePosition: {
        value: new Vector3(
          this.middleWavePosition?.x ?? 5.0,
          this.middleWavePosition?.y ?? 0.0,
          this.middleWavePosition?.rotate ?? 0.2,
        ),
      },
      bottomWavePosition: {
        value: new Vector3(
          this.bottomWavePosition?.x ?? 2.0,
          this.bottomWavePosition?.y ?? -0.7,
          this.bottomWavePosition?.rotate ?? 0.4,
        ),
      },
      iMouse: { value: new Vector2(-1000, -1000) },
      interactive: { value: this.interactive },
      bendRadius: { value: this.bendRadius },
      bendStrength: { value: this.bendStrength },
      bendInfluence: { value: 0 },
      parallax: { value: this.parallax },
      parallaxStrength: { value: this.parallaxStrength },
      parallaxOffset: { value: new Vector2(0, 0) },
      lineGradient: {
        value: Array.from(
          { length: MAX_GRADIENT_STOPS },
          () => new Vector3(1, 1, 1),
        ),
      },
      lineGradientCount: { value: 0 },
    };

    if (this.linesGradient && this.linesGradient.length > 0) {
      const stops = this.linesGradient.slice(0, MAX_GRADIENT_STOPS);
      uniforms.lineGradientCount.value = stops.length;
      stops.forEach((hex, index) => {
        const color = hexToVec3(hex);
        uniforms.lineGradient.value[index].set(color.x, color.y, color.z);
      });
    }

    const material = new ShaderMaterial({
      uniforms: uniforms as unknown as Record<string, { value: unknown }>,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });
    const geometry = new PlaneGeometry(2, 2);
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.geometry = geometry;
    this.material = material;
    this.uniforms = uniforms;
    this.clock = new Clock();

    this.targetMouse = new Vector2(-1000, -1000);
    this.currentMouse = new Vector2(-1000, -1000);
    this.targetInfluence = 0;
    this.currentInfluence = 0;
    this.targetParallax = new Vector2(0, 0);
    this.currentParallax = new Vector2(0, 0);

    this.setSize();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.setSize());
      this.resizeObserver.observe(container);
    }

    if (this.interactive) {
      window.addEventListener('pointermove', this.handlePointerMove, {
        passive: true,
      });
      window.addEventListener('pointerleave', this.handlePointerLeave);
      window.addEventListener('pointercancel', this.handlePointerLeave);
      this.hasPointerListeners = true;
    }

    this.ngZone.runOutsideAngular(() => {
      this.renderLoop();
    });
  }

  private destroyScene(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.hasPointerListeners) {
      window.removeEventListener('pointermove', this.handlePointerMove);
      window.removeEventListener('pointerleave', this.handlePointerLeave);
      window.removeEventListener('pointercancel', this.handlePointerLeave);
    }
    this.hasPointerListeners = false;

    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer?.dispose();

    const canvas = this.renderer?.domElement;
    if (canvas?.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }

    this.scene = null;
    this.camera = null;
    this.geometry = null;
    this.material = null;
    this.renderer = null;
    this.clock = null;
    this.uniforms = null;
  }

  private setSize(): void {
    if (!this.renderer || !this.uniforms) {
      return;
    }

    const el = this.containerRef.nativeElement;
    const width = el.clientWidth || 1;
    const height = el.clientHeight || 1;

    this.renderer.setSize(width, height, false);
    this.uniforms.iResolution.value.set(
      this.renderer.domElement.width,
      this.renderer.domElement.height,
      1,
    );
  }

  private renderLoop = (): void => {
    if (
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.uniforms ||
      !this.clock
    ) {
      return;
    }

    this.uniforms.iTime.value = this.clock.getElapsedTime();

    if (this.interactive) {
      this.currentMouse.lerp(this.targetMouse, this.mouseDamping);
      this.uniforms.iMouse.value.copy(this.currentMouse);

      this.currentInfluence +=
        (this.targetInfluence - this.currentInfluence) * this.mouseDamping;
      this.uniforms.bendInfluence.value = this.currentInfluence;
    }

    if (this.parallax) {
      this.currentParallax.lerp(this.targetParallax, this.mouseDamping);
      this.uniforms.parallaxOffset.value.copy(this.currentParallax);
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.renderLoop);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.renderer) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const isInsideCanvas =
      x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

    if (!isInsideCanvas) {
      this.targetInfluence = 0.0;
      if (this.parallax) {
        this.targetParallax.set(0, 0);
      }
      return;
    }

    const dpr = this.renderer.getPixelRatio();

    this.targetMouse.set(x * dpr, (rect.height - y) * dpr);
    this.targetInfluence = 1.0;

    if (this.parallax) {
      const safeWidth = rect.width || 1;
      const safeHeight = rect.height || 1;
      const centerX = safeWidth / 2;
      const centerY = safeHeight / 2;
      const offsetX = (x - centerX) / safeWidth;
      const offsetY = -(y - centerY) / safeHeight;
      this.targetParallax.set(
        offsetX * this.parallaxStrength,
        offsetY * this.parallaxStrength,
      );
    }
  };

  private handlePointerLeave = (): void => {
    this.targetInfluence = 0.0;
  };

  private getLineCount(waveType: WaveType): number {
    if (typeof this.lineCount === 'number') {
      return this.lineCount;
    }

    if (!this.enabledWaves.includes(waveType)) {
      return 0;
    }

    const index = this.enabledWaves.indexOf(waveType);
    return this.lineCount[index] ?? 6;
  }

  private getLineDistance(waveType: WaveType): number {
    if (typeof this.lineDistance === 'number') {
      return this.lineDistance;
    }

    if (!this.enabledWaves.includes(waveType)) {
      return 0.1;
    }

    const index = this.enabledWaves.indexOf(waveType);
    return this.lineDistance[index] ?? 0.1;
  }
}
