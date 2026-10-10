import{HalfFloatType as i,ShaderMaterial as u,WebGLRenderTarget as s}from"three";import{FullScreenQuad as l,Pass as n}from"./Pass.js";class o extends n{constructor(e,t,r,a){super(),this.sceneA=e,this.cameraA=t,this.sceneB=r,this.cameraB=a,this.material=this._createMaterial(),this._renderTargetA=new s,this._renderTargetA.texture.type=i,this._renderTargetB=new s,this._renderTargetB.texture.type=i,this._fsQuad=new l(this.material)}setTransition(e){this.material.uniforms.mixRatio.value=e}useTexture(e){this.material.uniforms.useTexture.value=e?1:0}setTexture(e){this.material.uniforms.tMixTexture.value=e}setTextureThreshold(e){this.material.uniforms.threshold.value=e}setSize(e,t){this._renderTargetA.setSize(e,t),this._renderTargetB.setSize(e,t)}render(e,t){e.setRenderTarget(this._renderTargetA),e.render(this.sceneA,this.cameraA),e.setRenderTarget(this._renderTargetB),e.render(this.sceneB,this.cameraB);const r=this._fsQuad.material.uniforms;r.tDiffuse1.value=this._renderTargetA.texture,r.tDiffuse2.value=this._renderTargetB.texture,this.renderToScreen?(e.setRenderTarget(null),e.clear()):(e.setRenderTarget(t),this.clear&&e.clear()),this._fsQuad.render(e)}dispose(){this.material.dispose(),this._renderTargetA.dispose(),this._renderTargetB.dispose(),this._fsQuad.dispose()}_createMaterial(){return new u({uniforms:{tDiffuse1:{value:null},tDiffuse2:{value:null},mixRatio:{value:0},threshold:{value:.1},useTexture:{value:1},tMixTexture:{value:null}},vertexShader:`
				varying vec2 vUv;

				void main() {

					vUv = vec2( uv.x, uv.y );
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}
			`,fragmentShader:`
				uniform float mixRatio;

				uniform sampler2D tDiffuse1;
				uniform sampler2D tDiffuse2;
				uniform sampler2D tMixTexture;

				uniform int useTexture;
				uniform float threshold;

				varying vec2 vUv;

				void main() {

					vec4 texel1 = texture2D( tDiffuse1, vUv );
					vec4 texel2 = texture2D( tDiffuse2, vUv );

					if (useTexture == 1) {

						vec4 transitionTexel = texture2D( tMixTexture, vUv );
						float r = mixRatio * ( 1.0 + threshold * 2.0 ) - threshold;
						float mixf = clamp( ( transitionTexel.r - r ) * ( 1.0 / threshold ), 0.0, 1.0 );

						gl_FragColor = mix( texel1, texel2, mixf );

					} else {

						gl_FragColor = mix( texel2, texel1, mixRatio );

					}

				}
			`})}}export{o as RenderTransitionPass};
