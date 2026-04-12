"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { planeColor, type PhaseSnapshot } from "@immaculate/core";

function EdgeLink({
  start,
  end,
  strength
}: {
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  strength: number;
}) {
  const geometryRef = useRef<THREE.BufferGeometry>(null);

  useEffect(() => {
    if (!geometryRef.current) {
      return;
    }

    geometryRef.current.setFromPoints([
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z)
    ]);
  }, [end.x, end.y, end.z, start.x, start.y, start.z]);

  return (
    <line>
      <bufferGeometry ref={geometryRef} />
      <lineBasicMaterial
        color="#7bc7ff"
        transparent
        opacity={0.14 + strength * 0.55}
      />
    </line>
  );
}

function NodeCloud({ snapshot }: { snapshot: PhaseSnapshot }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
      groupRef.current.rotation.x = Math.sin(Date.now() * 0.00018) * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      {snapshot.edges.map((edge) => {
        const start = snapshot.nodes.find((node) => node.id === edge.from)?.position;
        const end = snapshot.nodes.find((node) => node.id === edge.to)?.position;

        if (!start || !end) {
          return null;
        }

        return <EdgeLink key={edge.id} start={start} end={end} strength={edge.propagation} />;
      })}

      {snapshot.nodes.map((node) => {
        const scale = 0.28 + node.activation * 0.55;
        const emissiveIntensity = 0.4 + node.activation * 0.9;
        return (
          <mesh
            key={node.id}
            position={[node.position.x, node.position.y, node.position.z]}
            scale={scale}
          >
            <sphereGeometry args={[0.5, 24, 24]} />
            <meshStandardMaterial
              color={planeColor(node.plane)}
              emissive={planeColor(node.plane)}
              emissiveIntensity={emissiveIntensity}
              roughness={0.22}
              metalness={0.18}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function ConnectomeScene({ snapshot }: { snapshot: PhaseSnapshot | null }) {
  return (
    <Canvas camera={{ position: [0, 0, 18], fov: 42 }}>
      <color attach="background" args={["#08141f"]} />
      <ambientLight intensity={0.55} />
      <pointLight position={[8, 8, 8]} intensity={45} />
      <pointLight position={[-10, -6, -6]} color="#5ef2c7" intensity={18} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -6.2, 0]}>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color="#091018" />
      </mesh>
      {snapshot ? <NodeCloud snapshot={snapshot} /> : null}
    </Canvas>
  );
}
