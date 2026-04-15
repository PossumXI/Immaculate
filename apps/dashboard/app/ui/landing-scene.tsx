"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const values = new Float32Array(240 * 3);
    for (let index = 0; index < values.length; index += 3) {
      values[index] = (Math.random() - 0.5) * 18;
      values[index + 1] = (Math.random() - 0.5) * 18;
      values[index + 2] = (Math.random() - 0.5) * 18;
    }
    return values;
  }, []);

  useFrame(({ clock }) => {
    if (!pointsRef.current) {
      return;
    }
    pointsRef.current.rotation.y = clock.elapsedTime * 0.04;
    pointsRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.18) * 0.12;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial color="#8cd3ff" size={0.05} transparent opacity={0.8} />
    </points>
  );
}

function CoreAssembly() {
  const source = useLoader(OBJLoader, "/assets/immaculate-core.obj");
  const assemblyRef = useRef<THREE.Group>(null);

  const prepared = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: "#c6f3ff",
      emissive: "#5dbdff",
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.82
    });
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: "#ffe48b",
      transparent: true,
      opacity: 0.2,
      wireframe: true
    });

    const buildClone = (scale: number, rotationY: number, positionZ: number) => {
      const clone = source.clone(true);
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = material;
        }
      });

      const wire = source.clone(true);
      wire.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = wireMaterial;
        }
      });

      const group = new THREE.Group();
      group.scale.setScalar(scale);
      group.rotation.y = rotationY;
      group.position.z = positionZ;
      group.add(clone);
      group.add(wire);
      return group;
    };

    return [
      buildClone(1.65, 0, 0),
      buildClone(1.05, Math.PI / 4, 0),
      buildClone(0.6, Math.PI / 2, 0)
    ];
  }, [source]);

  useFrame(({ clock }, delta) => {
    if (!assemblyRef.current) {
      return;
    }
    assemblyRef.current.rotation.y += delta * 0.35;
    assemblyRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.35) * 0.12;
    assemblyRef.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.24;
  });

  return (
    <group ref={assemblyRef}>
      {prepared.map((group, index) => (
        <primitive key={index} object={group} />
      ))}
    </group>
  );
}

export function LandingScene() {
  return (
    <Canvas camera={{ position: [0, 0, 7.5], fov: 34 }} dpr={[1, 1.6]}>
      <color attach="background" args={["#081019"]} />
      <fog attach="fog" args={["#081019", 8, 16]} />
      <ambientLight intensity={0.8} />
      <pointLight position={[5, 4, 6]} intensity={22} color="#9ad9ff" />
      <pointLight position={[-6, -4, 5]} intensity={16} color="#ffd684" />
      <spotLight position={[0, 6, 8]} intensity={18} angle={0.42} penumbra={0.7} color="#f4fbff" />
      <Suspense fallback={null}>
        <ParticleField />
        <CoreAssembly />
      </Suspense>
    </Canvas>
  );
}
