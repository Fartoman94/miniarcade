const e={name:"UnpackDepthRGBAShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			float depth = texture2D( tDiffuse, vUv ).r;

			#ifdef USE_REVERSED_DEPTH_BUFFER

				gl_FragColor = vec4( vec3( depth ), opacity );

			#else

				gl_FragColor = vec4( vec3( 1.0 - depth ), opacity );

			#endif

		}`};export{e as UnpackDepthRGBAShader};
