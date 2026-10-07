// 2D simplex noise adapted from https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl
// Copyright (C) 2011 Ashima Arts (Ian McEwan). Maintainer: Stefan Gustavson.
// MIT: see topofield-noise-LICENSE.txt, distributed with this source.
// Fullscreen triangle, contours and grid are a local implementation of the supplied visual brief.
export const vertexShader = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;
export const fragmentShader = `
/*
Copyright (C) 2011 by Ashima Arts (Simplex noise)
Copyright (C) 2011-2016 by Stefan Gustavson (Classic noise and others)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 resolution;
uniform float time;
uniform float density;
vec3 mod289(vec3 x) { return x-floor(x/289.0)*289.0; }
vec2 mod289(vec2 x) { return x-floor(x/289.0)*289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+10.0)*x); }
float snoise(vec2 v) {
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz;
  x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 a0=x-floor(x+0.5);
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
void main() {
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 p=gl_FragCoord.xy/max(resolution.y,1.0)*0.4;
  float elevation=snoise(p+vec2(time,-time*0.4))+0.22*snoise(p*2.0+time*0.3);
  float distanceToLine=abs(fract(elevation*density)-0.5);
  float line=1.0-smoothstep(0.012,0.065,distanceToLine);
  vec2 cell=abs(fract(gl_FragCoord.xy/42.0)-0.5);
  float grid=smoothstep(0.48,0.5,max(cell.x,cell.y));
  float edge=smoothstep(0.0,0.12,uv.y)*smoothstep(0.0,0.12,1.0-uv.y);
  gl_FragColor=vec4(vec3(0.694,0.902,0.773), (line*0.55+grid*0.055)*edge);
}
`;
