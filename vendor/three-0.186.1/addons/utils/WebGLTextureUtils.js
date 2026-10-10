import{PlaneGeometry as g,ShaderMaterial as u,Uniform as p,Mesh as w,PerspectiveCamera as h,Scene as S,WebGLRenderer as T,CanvasTexture as C,SRGBColorSpace as _}from"three";let l,c,i,o;function U(e,m=1/0,n=null){c||(c=new g(2,2,1,1)),i||(i=new u({uniforms:{blitTexture:new p(e)},vertexShader:`
			varying vec2 vUv;
			void main(){
				vUv = uv;
				gl_Position = vec4(position.xy * 1.0,0.,.999999);
			}`,fragmentShader:`
			uniform sampler2D blitTexture; 
			varying vec2 vUv;

			void main(){ 
				gl_FragColor = vec4(vUv.xy, 0, 1);
				
				#ifdef IS_SRGB
				gl_FragColor = sRGBTransferOETF( texture2D( blitTexture, vUv) );
				#else
				gl_FragColor = texture2D( blitTexture, vUv);
				#endif
			}`})),i.uniforms.blitTexture.value=e,i.defines.IS_SRGB=e.colorSpace==_,i.needsUpdate=!0,o||(o=new w(c,i),o.frustumCulled=!1);const f=new h,v=new S;v.add(o),n===null&&(n=l=new T({antialias:!1}));const r=Math.min(e.image.width,m),s=Math.min(e.image.height,m);n.setSize(r,s),n.clear(),n.render(v,f);const t=document.createElement("canvas"),d=t.getContext("2d");t.width=r,t.height=s,d.drawImage(n.domElement,0,0,r,s);const a=new C(t);return a.minFilter=e.minFilter,a.magFilter=e.magFilter,a.wrapS=e.wrapS,a.wrapT=e.wrapT,a.colorSpace=e.colorSpace,a.name=e.name,l&&(l.forceContextLoss(),l.dispose(),l=null),a}export{U as decompress};
