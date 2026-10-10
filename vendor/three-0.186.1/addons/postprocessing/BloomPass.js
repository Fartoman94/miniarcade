import{AdditiveBlending as v,HalfFloatType as u,ShaderMaterial as f,UniformsUtils as m,Vector2 as h,WebGLRenderTarget as d}from"three";import{Pass as c,FullScreenQuad as g}from"./Pass.js";import{ConvolutionShader as S}from"../shaders/ConvolutionShader.js";class n extends c{constructor(e=1,t=25,s=4){super(),this.combineUniforms=m.clone(l.uniforms),this.combineUniforms.strength.value=e,this.materialCombine=new f({name:l.name,uniforms:this.combineUniforms,vertexShader:l.vertexShader,fragmentShader:l.fragmentShader,blending:v,transparent:!0});const i=S;this.convolutionUniforms=m.clone(i.uniforms),this.convolutionUniforms.uImageIncrement.value=n.blurX,this.convolutionUniforms.cKernel.value=p(s),this.materialConvolution=new f({name:i.name,uniforms:this.convolutionUniforms,vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,defines:{KERNEL_SIZE_FLOAT:t.toFixed(1),KERNEL_SIZE_INT:t.toFixed(0)}}),this.needsSwap=!1,this._renderTargetX=new d(1,1,{type:u,depthBuffer:!1}),this._renderTargetX.texture.name="BloomPass.x",this._renderTargetY=new d(1,1,{type:u,depthBuffer:!1}),this._renderTargetY.texture.name="BloomPass.y",this._fsQuad=new g(null)}render(e,t,s,i,o){o&&e.state.buffers.stencil.setTest(!1),this._fsQuad.material=this.materialConvolution,this.convolutionUniforms.tDiffuse.value=s.texture,this.convolutionUniforms.uImageIncrement.value=n.blurX,e.setRenderTarget(this._renderTargetX),e.clear(),this._fsQuad.render(e),this.convolutionUniforms.tDiffuse.value=this._renderTargetX.texture,this.convolutionUniforms.uImageIncrement.value=n.blurY,e.setRenderTarget(this._renderTargetY),e.clear(),this._fsQuad.render(e),this._fsQuad.material=this.materialCombine,this.combineUniforms.tDiffuse.value=this._renderTargetY.texture,o&&e.state.buffers.stencil.setTest(!0),e.setRenderTarget(s),this.clear&&e.clear(),this._fsQuad.render(e)}setSize(e,t){this._renderTargetX.setSize(e,t),this._renderTargetY.setSize(e,t)}dispose(){this._renderTargetX.dispose(),this._renderTargetY.dispose(),this.materialCombine.dispose(),this.materialConvolution.dispose(),this._fsQuad.dispose()}}const l={name:"CombineShader",uniforms:{tDiffuse:{value:null},strength:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float strength;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = strength * texel;

		}`};n.blurX=new h(.001953125,0),n.blurY=new h(0,.001953125);function x(a,e){return Math.exp(-(a*a)/(2*e*e))}function p(a){let t=2*Math.ceil(a*3)+1;t>25&&(t=25);const s=(t-1)*.5,i=new Array(t);let o=0;for(let r=0;r<t;++r)i[r]=x(r-s,a),o+=i[r];for(let r=0;r<t;++r)i[r]/=o;return i}export{n as BloomPass};
