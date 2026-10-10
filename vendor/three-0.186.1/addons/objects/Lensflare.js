import{AdditiveBlending as X,Box2 as Y,BufferGeometry as k,Color as I,FramebufferTexture as _,InterleavedBuffer as q,InterleavedBufferAttribute as G,Mesh as V,MeshBasicMaterial as J,RawShaderMaterial as D,UnsignedByteType as E,Vector2 as S,Vector3 as B,Vector4 as K}from"three";class d extends V{constructor(){super(d.Geometry,new J({opacity:0,transparent:!0})),this.isLensflare=!0,this.type="Lensflare",this.frustumCulled=!1,this.renderOrder=1/0;const i=new B,n=new B,o=new _(16,16),s=new _(16,16);let T=E;const l=d.Geometry,h=new D({uniforms:{scale:{value:null},screenPosition:{value:null}},vertexShader:`

				precision highp float;

				uniform vec3 screenPosition;
				uniform vec2 scale;

				attribute vec3 position;

				void main() {

					gl_Position = vec4( position.xy * scale + screenPosition.xy, screenPosition.z, 1.0 );

				}`,fragmentShader:`

				precision highp float;

				void main() {

					gl_FragColor = vec4( 1.0, 0.0, 1.0, 1.0 );

				}`,depthTest:!0,depthWrite:!1,transparent:!1}),x=new D({uniforms:{map:{value:o},scale:{value:null},screenPosition:{value:null}},vertexShader:`

				precision highp float;

				uniform vec3 screenPosition;
				uniform vec2 scale;

				attribute vec3 position;
				attribute vec2 uv;

				varying vec2 vUV;

				void main() {

					vUV = uv;

					gl_Position = vec4( position.xy * scale + screenPosition.xy, screenPosition.z, 1.0 );

				}`,fragmentShader:`

				precision highp float;

				uniform sampler2D map;

				varying vec2 vUV;

				void main() {

					gl_FragColor = texture2D( map, vUV );

				}`,depthTest:!1,depthWrite:!1,transparent:!1}),U=new V(l,h),a=[],g=z.Shader,c=new D({name:g.name,uniforms:{map:{value:null},occlusionMap:{value:s},color:{value:new I(16777215)},scale:{value:new S},screenPosition:{value:new B}},vertexShader:g.vertexShader,fragmentShader:g.fragmentShader,blending:X,transparent:!0,depthWrite:!1}),L=new V(l,c);this.addElement=function(t){a.push(t)};const w=new S,u=new S,b=new Y,e=new K;this.onBeforeRender=function(t,A,v){t.getCurrentViewport(e);const F=t.getRenderTarget(),P=F!==null?F.texture.type:E;T!==P&&(o.dispose(),s.dispose(),o.type=s.type=P,T=P);const R=e.w/e.z,C=e.z/2,W=e.w/2;let p=16/e.w;if(w.set(p*R,p),b.min.set(e.x,e.y),b.max.set(e.x+(e.z-16),e.y+(e.w-16)),n.setFromMatrixPosition(this.matrixWorld),n.applyMatrix4(v.matrixWorldInverse),!(n.z>0)&&(i.copy(n).applyMatrix4(v.projectionMatrix),u.x=e.x+i.x*C+C-8,u.y=e.y+i.y*W+W-8,b.containsPoint(u))){t.copyFramebufferToTexture(o,u);let f=h.uniforms;f.scale.value=w,f.screenPosition.value=i,t.renderBufferDirect(v,null,l,h,U,null),t.copyFramebufferToTexture(s,u),f=x.uniforms,f.scale.value=w,f.screenPosition.value=i,t.renderBufferDirect(v,null,l,x,U,null);const j=-i.x*2,H=-i.y*2;for(let M=0,N=a.length;M<N;M++){const m=a[M],y=c.uniforms;y.color.value.copy(m.color),y.map.value=m.texture,y.screenPosition.value.x=i.x+j*m.distance,y.screenPosition.value.y=i.y+H*m.distance,p=m.size/e.w;const O=e.w/e.z;y.scale.value.set(p*O,p),c.uniformsNeedUpdate=!0,t.renderBufferDirect(v,null,l,c,L,null)}}},this.dispose=function(){h.dispose(),x.dispose(),c.dispose(),o.dispose(),s.dispose();for(let t=0,A=a.length;t<A;t++)a[t].texture.dispose()}}}class z{constructor(i,n=1,o=0,s=new I(16777215)){this.texture=i,this.size=n,this.distance=o,this.color=s}}z.Shader={name:"LensflareElementShader",uniforms:{map:{value:null},occlusionMap:{value:null},color:{value:null},scale:{value:null},screenPosition:{value:null}},vertexShader:`

		precision highp float;

		uniform vec3 screenPosition;
		uniform vec2 scale;

		uniform sampler2D occlusionMap;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUV;
		varying float vVisibility;

		void main() {

			vUV = uv;

			vec2 pos = position.xy;

			vec4 visibility = texture2D( occlusionMap, vec2( 0.1, 0.1 ) );
			visibility += texture2D( occlusionMap, vec2( 0.5, 0.1 ) );
			visibility += texture2D( occlusionMap, vec2( 0.9, 0.1 ) );
			visibility += texture2D( occlusionMap, vec2( 0.9, 0.5 ) );
			visibility += texture2D( occlusionMap, vec2( 0.9, 0.9 ) );
			visibility += texture2D( occlusionMap, vec2( 0.5, 0.9 ) );
			visibility += texture2D( occlusionMap, vec2( 0.1, 0.9 ) );
			visibility += texture2D( occlusionMap, vec2( 0.1, 0.5 ) );
			visibility += texture2D( occlusionMap, vec2( 0.5, 0.5 ) );

			vVisibility =        visibility.r / 9.0;
			vVisibility *= 1.0 - visibility.g / 9.0;
			vVisibility *=       visibility.b / 9.0;

			gl_Position = vec4( ( pos * scale + screenPosition.xy ).xy, screenPosition.z, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D map;
		uniform vec3 color;

		varying vec2 vUV;
		varying float vVisibility;

		void main() {

			vec4 texture = texture2D( map, vUV );
			texture.a *= vVisibility;
			gl_FragColor = texture;
			gl_FragColor.rgb *= color;

		}`},d.Geometry=function(){const r=new k,i=new Float32Array([-1,-1,0,0,0,1,-1,0,1,0,1,1,0,1,1,-1,1,0,0,1]),n=new q(i,5);return r.setIndex([0,1,2,0,2,3]),r.setAttribute("position",new G(n,3,0,!1)),r.setAttribute("uv",new G(n,2,3,!1)),r}();export{d as Lensflare,z as LensflareElement};
