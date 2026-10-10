import{Color as e}from"three";const o={name:"ColorifyShader",uniforms:{tDiffuse:{value:null},color:{value:new e(16777215)}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform vec3 color;
		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			gl_FragColor = vec4( v * color, texel.w );

		}`};export{o as ColorifyShader};
