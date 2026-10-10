import{DoubleSide as y,CanvasTexture as b,Mesh as f,MeshBasicMaterial as C,OrthographicCamera as D,PlaneGeometry as g,Scene as M,ShaderMaterial as S}from"three";class z{constructor(s){const o=this,w=s.name!==void 0&&s.name!=="";let p;const e={x:10,y:10,width:256,height:256},n=new D(window.innerWidth/-2,window.innerWidth/2,window.innerHeight/2,window.innerHeight/-2,1,10);n.position.set(0,0,2);const d=new M,u=new S({uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`
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
				}`}),m=new g(e.width,e.height),a=new f(m,u);d.add(a);let i,r;if(w){i=document.createElement("canvas");const t=i.getContext("2d");t.font="Bold 20px Arial";const h=t.measureText(s.name).width;i.width=h,i.height=25,t.font="Bold 20px Arial",t.fillStyle="rgba( 255, 0, 0, 1 )",t.fillText(s.name,0,20);const l=new b(i),c=new C({map:l,side:y,transparent:!0}),x=new g(i.width,i.height);r=new f(x,c),d.add(r)}function v(){o.position.set(o.position.x,o.position.y)}this.enabled=!0,this.size={width:e.width,height:e.height,set:function(t,h){this.width=t,this.height=h,a.scale.set(this.width/e.width,this.height/e.height,1),v()}},this.position={x:e.x,y:e.y,set:function(t,h){this.x=t,this.y=h;const l=o.size.width,c=o.size.height;a.position.set(-window.innerWidth/2+l/2+this.x,window.innerHeight/2-c/2-this.y,0),w&&r.position.set(a.position.x,a.position.y-o.size.height/2+i.height/2,0)}},this.render=function(t){this.enabled&&(u.uniforms.tDiffuse.value=s.shadow.map.texture,p=t.autoClear,t.autoClear=!1,t.clearDepth(),t.render(d,n),t.autoClear=p)},this.updateForWindowResize=function(){this.enabled&&(n.left=window.innerWidth/-2,n.right=window.innerWidth/2,n.top=window.innerHeight/2,n.bottom=window.innerHeight/-2,n.updateProjectionMatrix(),this.update())},this.update=function(){this.position.set(this.position.x,this.position.y),this.size.set(this.size.width,this.size.height)},this.update()}}export{z as ShadowMapViewer};
