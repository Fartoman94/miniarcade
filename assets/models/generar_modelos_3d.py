"""Low-poly 3D meshes exported as valid GLB assets for MiniArcade prototypes.
All geometry generated procedurally; no external models or copyrighted characters.
Coordinate system: y is up. Models are static meshes, not animated/rigged.
Run: python generar_modelos_3d.py
Needs: trimesh, numpy
"""
import math
from pathlib import Path
import numpy as np
import trimesh

ROOT=Path(__file__).resolve().parents[1]/'modelos_3d_glb'
ROOT.mkdir(parents=True,exist_ok=True)

P={'stone':'#9fa5aa','stone2':'#6d7c89','wood':'#714b32','wood2':'#aa7644','roof':'#b74f3c','gold':'#f5bb4f','metal':'#555d74','metal2':'#b1bad1','green':'#41b783','darkgreen':'#185c4c','red':'#db4771','blue':'#327ed7','cyan':'#67e5eb','violet':'#a779f8','skin':'#f1b38d','dark':'#25273c','white':'#d9eced','fire':'#ff9d39','black':'#151d31'}

def col(name):
    s=P.get(name,name).lstrip('#')
    return [int(s[i:i+2],16) for i in (0,2,4)]+[255]

class Model:
    def __init__(self):self.scene=trimesh.Scene();self.n=0
    def add(self,mesh,c):
        mesh.visual.vertex_colors=np.tile(col(c),(len(mesh.vertices),1));self.scene.add_geometry(mesh,node_name=f'part_{self.n:03}');self.n+=1
    def box(self,x,y,z,sx,sy,sz,c):
        m=trimesh.creation.box(extents=[sx,sy,sz]);m.apply_translation([x,y,z]);self.add(m,c)
    def ball(self,x,y,z,r,c,subdivisions=1):
        m=trimesh.creation.icosphere(subdivisions=subdivisions,radius=r);m.apply_translation([x,y,z]);self.add(m,c)
    def cylinder(self,x,y,z,r,h,c,segments=10):
        m=trimesh.creation.cylinder(radius=r,height=h,sections=segments);m.apply_transform(trimesh.transformations.rotation_matrix(math.pi/2,[1,0,0]));m.apply_translation([x,y,z]);self.add(m,c)
    def cone(self,x,y,z,r,h,c,segments=8):
        m=trimesh.creation.cone(radius=r,height=h,sections=segments);m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi/2,[1,0,0]));m.apply_translation([x,y,z]);self.add(m,c)
    def save(self,name):
        (ROOT/f'{name}.glb').write_bytes(self.scene.export(file_type='glb'))

m=Model();m.box(0,.1,0,1.3,.2,1.3,'stone');m.box(0,.7,0,1.0,1.0,1.0,'wood2');m.box(0,1.27,0,1.22,.18,1.2,'roof');m.box(0,.7,.51,.38,.64,.05,'dark');m.box(.27,.87,.53,.25,.3,.04,'cyan');m.save('casa_modular')
m=Model();m.box(0,.15,0,3.0,.3,1.3,'stone');m.box(-1.22,1.45,0,.56,2.5,1.15,'stone');m.box(1.22,1.45,0,.56,2.5,1.15,'stone');m.box(0,2.4,0,2.4,.35,1.0,'stone');m.box(0,.94,0,1.4,1.5,.18,'wood');m.box(0,1.55,.12,.65,.11,.08,'gold');m.save('puerta_castillo')
m=Model();m.cylinder(0,.22,0,.75,.35,'wood');m.cylinder(0,.57,0,.7,.1,'gold');m.box(0,.28,.52,.3,.26,.08,'metal');m.ball(0,.29,.57,.08,'gold');m.save('cofre_tesoro')
m=Model();m.box(0,.3,0,.9,.6,.9,'wood');m.box(0,.61,0,.96,.08,.96,'wood2');m.box(.02,.32,.46,.65,.14,.07,'metal');m.save('caja_madera')
m=Model();m.cylinder(0,.47,0,.4,.9,'wood');m.cylinder(0,.88,0,.43,.10,'metal');m.cylinder(0,.10,0,.43,.1,'metal');m.save('barril')
m=Model();m.cylinder(0,.6,0,.18,1.2,'wood');m.cone(0,1.67,0,.91,1.35,'darkgreen');m.cone(0,2.21,0,.7,1.2,'green');m.cone(0,2.69,0,.5,1.0,'darkgreen');m.save('arbol_pino')
m=Model();m.cylinder(0,.15,0,.47,.25,'stone2');m.cone(0,1.05,0,.42,1.55,'cyan',6);m.ball(0,1.2,0,.35,'violet');m.save('cristal_magico')
m=Model();m.ball(0,.57,0,.60,'green');m.ball(-.21,.7,.49,.13,'white');m.ball(.21,.7,.49,.13,'white');m.ball(-.21,.71,.60,.055,'dark');m.ball(.21,.71,.60,.055,'dark');m.save('slime_monstruo')
m=Model();m.box(0,.9,0,.95,1.2,.75,'stone');m.box(0,1.8,0,.7,.65,.65,'stone2');m.box(-.63,1.1,0,.35,1.1,.35,'stone2');m.box(.63,1.1,0,.35,1.1,.35,'stone2');m.box(-.3,.27,0,.33,.54,.35,'stone');m.box(.3,.27,0,.33,.54,.35,'stone');m.ball(-.18,1.85,.34,.09,'fire');m.ball(.18,1.85,.34,.09,'fire');m.save('golem_piedra')
m=Model();m.ball(0,1.62,0,.28,'skin');m.box(0,.95,0,.65,1.0,.37,'blue');m.box(-.17,.27,0,.22,.56,.24,'wood');m.box(.17,.27,0,.22,.56,.24,'wood');m.box(-.43,1.0,0,.20,.78,.22,'skin');m.box(.43,1.0,0,.20,.78,.22,'skin');m.cone(0,2.01,0,.4,.35,'wood2');m.save('npc_aldeano')
m=Model();m.ball(0,1.65,0,.25,'skin');m.box(0,.98,0,.72,1.08,.42,'metal2');m.box(-.42,1.03,0,.24,.83,.3,'metal');m.box(.42,1.03,0,.24,.83,.3,'metal');m.box(-.19,.29,0,.25,.57,.29,'metal');m.box(.19,.29,0,.25,.57,.29,'metal');m.cone(0,2.08,0,.36,.42,'metal');m.box(-.56,1.05,.12,.09,.9,.75,'blue');m.save('npc_guardia')
m=Model();m.ball(0,1.78,0,.29,'skin');m.cone(0,1.49,0,.49,.96,'violet');m.cylinder(0,.6,0,.38,.94,'violet');m.box(-.45,.95,0,.18,.85,.18,'skin');m.box(.45,.95,0,.18,.85,.18,'skin');m.cylinder(.62,1.08,0,.08,2.0,'wood');m.ball(.62,2.18,0,.19,'cyan');m.cone(0,2.20,0,.54,.38,'violet');m.save('npc_mago')
m=Model();m.box(0,.55,0,1.6,.28,2.7,'blue');m.box(0,.75,.1,1.1,.15,1.1,'cyan');m.box(-1.15,.6,.2,.80,.12,.95,'metal2');m.box(1.15,.6,.2,.80,.12,.95,'metal2');m.cone(0,.65,1.62,.48,.98,'red');m.cylinder(-.45,.35,-1.43,.25,.35,'fire');m.cylinder(.45,.35,-1.43,.25,.35,'fire');m.save('nave_espacial')
m=Model();m.box(0,.4,0,1.4,.35,2.35,'red');m.box(0,.75,-.14,1.15,.35,1.15,'cyan');m.box(-.92,.27,-.75,.42,.54,.65,'black');m.box(.92,.27,-.75,.42,.54,.65,'black');m.box(-.92,.27,.8,.42,.54,.65,'black');m.box(.92,.27,.8,.42,.54,.65,'black');m.box(0,.32,1.20,.8,.12,.15,'gold');m.save('auto_arcade')
m=Model();m.cylinder(0,.65,0,.70,.18,'stone2');m.cylinder(0,1.5,0,.48,1.5,'violet');m.cylinder(0,1.5,0,.30,1.57,'cyan');m.cylinder(0,2.34,0,.70,.19,'stone2');m.save('portal_magico')
m=Model();m.cylinder(0,.55,0,.33,1.1,'wood');m.ball(0,1.33,0,.43,'fire');m.ball(0,1.60,0,.22,'red');m.save('antorcha')
m=Model();m.ball(0,.7,0,.54,'metal');m.ball(-.55,.7,.1,.22,'cyan');m.ball(.55,.7,.1,.22,'cyan');m.ball(0,.7,.46,.28,'red');m.cone(0,1.28,0,.22,.45,'metal');m.save('dron_enemigo')
m=Model();m.box(0,.75,0,1.3,.65,2,'wood2');m.box(-.70,.7,-.2,.12,.7,1.5,'wood');m.box(.70,.7,-.2,.12,.7,1.5,'wood');m.box(0,1.17,-.3,.82,.17,1.2,'roof');m.box(0,.8,1.02,.5,.24,.2,'gold');m.save('carro_mercante')
m=Model();m.cylinder(0,.75,0,.45,1.3,'stone');m.cone(0,1.7,0,.55,.7,'roof');m.cylinder(0,.05,0,.72,.12,'stone2');m.ball(0,1.88,0,.08,'gold');m.save('torre_vigia')
m=Model();m.box(0,.25,0,2,.3,1,'wood2');m.box(0,.4,0,.35,.1,2,'wood');m.cylinder(0,1.2,0,.13,1.5,'wood');m.box(.35,1.4,0,.7,.25,1.4,'white');m.save('barco_simple')

if __name__=='__main__':
 for f in sorted(ROOT.glob('*.glb')):
  loaded=trimesh.load(str(f),force='scene')
  assert len(loaded.geometry)>0, f
  print(f.name, f.stat().st_size, 'bytes',len(loaded.geometry),'meshes')
