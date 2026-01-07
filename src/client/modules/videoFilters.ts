/**
 * ClipCraft - Video Filters Module
 * WebGL-based real-time video filters
 */

import type { VideoFilter, FilterPreset } from '@types/index';

export class VideoFilterEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private videoTexture: WebGLTexture | null = null;
  private filters: VideoFilter[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.init();
  }

  private init(): void {
    const gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl as WebGLRenderingContext;

    // Create shader program
    this.program = this.createProgram();
    if (!this.program) return;

    // Set up buffers
    this.setupBuffers();

    // Create texture
    this.videoTexture = this.gl.createTexture();
  }

  private createProgram(): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Program linking failed:', this.gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private setupBuffers(): void {
    if (!this.gl || !this.program) return;

    const vertices = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    const positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
  }

  /**
   * Apply filters to video frame
   */
  renderFrame(video: HTMLVideoElement): void {
    if (!this.gl || !this.program || !this.videoTexture) return;

    // Update canvas size if needed
    if (this.canvas.width !== video.videoWidth || this.canvas.height !== video.videoHeight) {
      this.canvas.width = video.videoWidth;
      this.canvas.height = video.videoHeight;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    // Upload video frame to texture
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      video
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);

    // Use program
    this.gl.useProgram(this.program);

    // Set uniforms based on active filters
    const filterValues = this.getFilterValues();
    this.gl.uniform1f(
      this.gl.getUniformLocation(this.program, 'u_brightness'),
      filterValues.brightness
    );
    this.gl.uniform1f(
      this.gl.getUniformLocation(this.program, 'u_contrast'),
      filterValues.contrast
    );
    this.gl.uniform1f(
      this.gl.getUniformLocation(this.program, 'u_saturation'),
      filterValues.saturation
    );
    this.gl.uniform1f(
      this.gl.getUniformLocation(this.program, 'u_exposure'),
      filterValues.exposure
    );
    this.gl.uniform1f(
      this.gl.getUniformLocation(this.program, 'u_temperature'),
      filterValues.temperature
    );
    this.gl.uniform1f(
      this.gl.getUniformLocation(this.program, 'u_grayscale'),
      filterValues.grayscale
    );
    this.gl.uniform1f(this.gl.getUniformLocation(this.program, 'u_sepia'), filterValues.sepia);

    // Draw
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private getFilterValues() {
    const values = {
      brightness: 0.0,
      contrast: 1.0,
      saturation: 1.0,
      exposure: 0.0,
      temperature: 0.0,
      grayscale: 0.0,
      sepia: 0.0,
    };

    for (const filter of this.filters) {
      if (!filter.enabled) continue;

      switch (filter.type) {
        case 'brightness':
          values.brightness = (filter.value - 50) / 50; // -1 to 1
          break;
        case 'contrast':
          values.contrast = filter.value / 50; // 0 to 2
          break;
        case 'saturation':
          values.saturation = filter.value / 50; // 0 to 2
          break;
        case 'exposure':
          values.exposure = (filter.value - 50) / 50; // -1 to 1
          break;
        case 'temperature':
          values.temperature = (filter.value - 50) / 100; // -0.5 to 0.5
          break;
        case 'grayscale':
          values.grayscale = filter.value / 100; // 0 to 1
          break;
        case 'sepia':
          values.sepia = filter.value / 100; // 0 to 1
          break;
      }
    }

    return values;
  }

  /**
   * Set active filters
   */
  setFilters(filters: VideoFilter[]): void {
    this.filters = filters;
  }

  /**
   * Add or update a filter
   */
  updateFilter(filter: VideoFilter): void {
    const index = this.filters.findIndex((f) => f.type === filter.type);
    if (index >= 0) {
      this.filters[index] = filter;
    } else {
      this.filters.push(filter);
    }
  }

  /**
   * Get current filters
   */
  getFilters(): VideoFilter[] {
    return [...this.filters];
  }

  /**
   * Reset all filters
   */
  resetFilters(): void {
    this.filters = [];
  }

  /**
   * Apply a preset
   */
  applyPreset(preset: FilterPreset): void {
    this.filters = [...preset.filters];
  }
}

// ============================================
// Filter Presets
// ============================================

export const filterPresets: FilterPreset[] = [
  {
    name: 'Vibrant',
    filters: [
      { type: 'saturation', value: 75, enabled: true },
      { type: 'contrast', value: 60, enabled: true },
      { type: 'brightness', value: 55, enabled: true },
    ],
  },
  {
    name: 'Cinematic',
    filters: [
      { type: 'contrast', value: 65, enabled: true },
      { type: 'saturation', value: 40, enabled: true },
      { type: 'temperature', value: 30, enabled: true },
    ],
  },
  {
    name: 'Black & White',
    filters: [
      { type: 'grayscale', value: 100, enabled: true },
      { type: 'contrast', value: 60, enabled: true },
    ],
  },
  {
    name: 'Vintage',
    filters: [
      { type: 'sepia', value: 80, enabled: true },
      { type: 'contrast', value: 55, enabled: true },
      { type: 'saturation', value: 70, enabled: true },
    ],
  },
  {
    name: 'Bright & Airy',
    filters: [
      { type: 'brightness', value: 65, enabled: true },
      { type: 'exposure', value: 60, enabled: true },
      { type: 'saturation', value: 45, enabled: true },
    ],
  },
];

// ============================================
// Shader Sources
// ============================================

const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
    v_texCoord.y = 1.0 - v_texCoord.y;
  }
`;

const fragmentShaderSource = `
  precision mediump float;

  uniform sampler2D u_image;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_exposure;
  uniform float u_temperature;
  uniform float u_grayscale;
  uniform float u_sepia;

  varying vec2 v_texCoord;

  vec3 adjustBrightness(vec3 color, float brightness) {
    return color + brightness;
  }

  vec3 adjustContrast(vec3 color, float contrast) {
    return (color - 0.5) * contrast + 0.5;
  }

  vec3 adjustSaturation(vec3 color, float saturation) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation);
  }

  vec3 adjustExposure(vec3 color, float exposure) {
    return color * pow(2.0, exposure);
  }

  vec3 adjustTemperature(vec3 color, float temperature) {
    color.r += temperature;
    color.b -= temperature;
    return color;
  }

  vec3 toGrayscale(vec3 color, float amount) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(color, vec3(gray), amount);
  }

  vec3 toSepia(vec3 color, float amount) {
    vec3 sepia = vec3(
      dot(color, vec3(0.393, 0.769, 0.189)),
      dot(color, vec3(0.349, 0.686, 0.168)),
      dot(color, vec3(0.272, 0.534, 0.131))
    );
    return mix(color, sepia, amount);
  }

  void main() {
    vec4 texColor = texture2D(u_image, v_texCoord);
    vec3 color = texColor.rgb;

    // Apply filters in order
    color = adjustExposure(color, u_exposure);
    color = adjustBrightness(color, u_brightness);
    color = adjustContrast(color, u_contrast);
    color = adjustSaturation(color, u_saturation);
    color = adjustTemperature(color, u_temperature);
    color = toGrayscale(color, u_grayscale);
    color = toSepia(color, u_sepia);

    gl_FragColor = vec4(color, texColor.a);
  }
`;
