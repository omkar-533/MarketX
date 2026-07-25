import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

const METAL = '#7a93b0';
const FACE = '#dbe7f2';
const CYAN = '#22d3ee';
const DEEP = '#0b1c2e';

function Gear({
  position,
  scale = 1,
  speed = 1,
}: {
  position: [number, number, number];
  scale?: number;
  speed?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * speed;
  });
  return (
    <mesh ref={ref} position={position} scale={scale}>
      <torusGeometry args={[0.18, 0.045, 12, 24]} />
      <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.55} metalness={0.8} roughness={0.25} />
    </mesh>
  );
}

function ThinkerRobot() {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const eye = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.position.y = Math.sin(t * 0.9) * 0.04;
      root.current.rotation.y = -0.35 + Math.sin(t * 0.35) * 0.12;
    }
    if (head.current) {
      head.current.rotation.x = -0.08 + Math.sin(t * 0.7) * 0.04;
      head.current.rotation.z = Math.sin(t * 0.45) * 0.03;
    }
    if (arm.current) {
      arm.current.rotation.z = 0.15 + Math.sin(t * 0.8) * 0.05;
      arm.current.rotation.x = -0.2 + Math.sin(t * 0.6) * 0.04;
    }
    if (core.current) {
      const mat = core.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + Math.sin(t * 2.2) * 0.35;
    }
    if (eye.current) {
      const mat = eye.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.4;
    }
  });

  const chipPositions = useMemo(
    () =>
      [
        [0.28, 0.22, 0.05],
        [0.34, 0.05, 0.08],
        [0.3, -0.12, 0.06],
        [0.22, 0.32, -0.05],
      ] as [number, number, number][],
    [],
  );

  return (
    <group ref={root} position={[-0.15, -0.35, 0]} scale={1.15}>
      {/* Torso */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <capsuleGeometry args={[0.38, 0.55, 8, 16]} />
        <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.28} />
      </mesh>
      <mesh ref={core} position={[0, 0.28, 0.32]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.8} metalness={0.4} roughness={0.2} />
      </mesh>
      <mesh position={[0, -0.05, 0.3]}>
        <boxGeometry args={[0.35, 0.06, 0.04]} />
        <meshStandardMaterial color={DEEP} metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Shoulders */}
      <mesh position={[-0.42, 0.42, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0.42, 0.42, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color={METAL} metalness={0.9} roughness={0.25} />
      </mesh>

      {/* Left arm (down / idle) */}
      <group position={[-0.48, 0.3, 0]} rotation={[0.2, 0, 0.35]}>
        <mesh position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.07, 0.28, 6, 12]} />
          <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.5, 0.05]} rotation={[0.4, 0, 0]}>
          <capsuleGeometry args={[0.06, 0.24, 6, 12]} />
          <meshStandardMaterial color="#8aa3bc" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Right arm — Thinker pose (hand to chin) */}
      <group ref={arm} position={[0.48, 0.35, 0.05]} rotation={[-0.15, 0.2, -0.95]}>
        <mesh position={[0, -0.2, 0]}>
          <capsuleGeometry args={[0.075, 0.26, 6, 12]} />
          <meshStandardMaterial color={METAL} metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh position={[0.05, -0.48, 0.12]} rotation={[0.9, 0.2, -0.4]}>
          <capsuleGeometry args={[0.06, 0.22, 6, 12]} />
          <meshStandardMaterial color="#8aa3bc" metalness={0.8} roughness={0.28} />
        </mesh>
        {/* Hand */}
        <group position={[0.12, -0.68, 0.28]} rotation={[0.6, 0.4, -0.2]}>
          <mesh>
            <boxGeometry args={[0.12, 0.08, 0.16]} />
            <meshStandardMaterial color={FACE} metalness={0.55} roughness={0.35} />
          </mesh>
          {[ -0.04, 0, 0.04 ].map((x, i) => (
            <mesh key={i} position={[x, 0.02, 0.1]} rotation={[0.3, 0, 0]}>
              <capsuleGeometry args={[0.015, 0.06, 4, 8]} />
              <meshStandardMaterial color={FACE} metalness={0.5} roughness={0.4} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Neck */}
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.16, 16]} />
        <meshStandardMaterial color="#5d738c" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0.12, 0.62, 0]}>
        <torusGeometry args={[0.08, 0.02, 8, 16]} />
        <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.4} />
      </mesh>

      {/* Head */}
      <group ref={head} position={[0, 0.9, 0]}>
        {/* Face shell */}
        <mesh castShadow>
          <sphereGeometry args={[0.32, 32, 32]} />
          <meshStandardMaterial color={FACE} metalness={0.45} roughness={0.35} />
        </mesh>
        {/* Open cranial shell (back-right) */}
        <mesh position={[0.18, 0.05, -0.05]} rotation={[0.2, -0.6, 0.3]}>
          <sphereGeometry args={[0.26, 24, 24, 0, Math.PI * 1.1, 0, Math.PI * 0.85]} />
          <meshStandardMaterial
            color={DEEP}
            metalness={0.7}
            roughness={0.4}
            side={THREE.DoubleSide}
            transparent
            opacity={0.92}
          />
        </mesh>

        {/* Eye slit */}
        <mesh ref={eye} position={[-0.08, 0.04, 0.28]} rotation={[0, -0.15, 0]}>
          <boxGeometry args={[0.14, 0.025, 0.02]} />
          <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={1} />
        </mesh>
        <mesh position={[-0.02, -0.06, 0.3]}>
          <boxGeometry args={[0.05, 0.015, 0.01]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Circuit etching */}
        <mesh position={[-0.22, 0.02, 0.18]} rotation={[0, 0.5, 0.2]}>
          <torusGeometry args={[0.08, 0.008, 8, 24]} />
          <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.35} />
        </mesh>

        {/* Internal gears & chips */}
        <Gear position={[0.22, 0.12, 0]} scale={1.1} speed={1.2} />
        <Gear position={[0.28, -0.02, 0.06]} scale={0.7} speed={-1.8} />
        <Gear position={[0.18, -0.08, -0.05]} scale={0.55} speed={2.2} />
        {chipPositions.map((p, i) => (
          <mesh key={i} position={p}>
            <boxGeometry args={[0.08, 0.05, 0.02]} />
            <meshStandardMaterial
              color={i % 2 ? '#0ea5e9' : '#1e293b'}
              emissive={i % 2 ? CYAN : '#000'}
              emissiveIntensity={i % 2 ? 0.35 : 0}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
        ))}
        {/* Wire glow tubes */}
        <mesh position={[0.25, 0.2, -0.08]} rotation={[0.5, 0.3, 0.8]}>
          <cylinderGeometry args={[0.012, 0.012, 0.28, 8]} />
          <meshStandardMaterial color={CYAN} emissive={CYAN} emissiveIntensity={0.7} />
        </mesh>
        <mesh position={[0.32, 0.05, 0.02]} rotation={[1.2, 0.1, 0.4]}>
          <cylinderGeometry args={[0.01, 0.01, 0.22, 8]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.5} />
        </mesh>
      </group>

      {/* Soft ground shadow disc */}
      <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={1.35} color="#dff6ff" castShadow />
      <pointLight position={[-2, 2, 3]} intensity={1.1} color="#22d3ee" />
      <pointLight position={[3, 1, -2]} intensity={0.7} color="#3b82f6" />
      <spotLight position={[0, 5, 2]} angle={0.45} penumbra={0.6} intensity={0.9} color="#67e8f9" />
    </>
  );
}

function DataField() {
  return (
    <>
      <Sparkles count={50} scale={[8, 5, 4]} size={2.5} speed={0.35} color="#67e8f9" opacity={0.55} />
      <Sparkles count={30} scale={[6, 4, 3]} size={1.5} speed={0.2} color="#93c5fd" opacity={0.4} position={[1, 0.5, -1]} />
      <mesh position={[0, 0, -3]}>
        <planeGeometry args={[14, 9]} />
        <meshBasicMaterial color="#031018" />
      </mesh>
      {/* Soft chart-like bars in background */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-3.2 + i * 0.55, -1.4 + (i % 5) * 0.15, -2.6]}>
          <boxGeometry args={[0.18, 0.4 + (i % 4) * 0.35, 0.05]} />
          <meshStandardMaterial
            color="#0e7490"
            emissive="#22d3ee"
            emissiveIntensity={0.15}
            transparent
            opacity={0.35}
          />
        </mesh>
      ))}
    </>
  );
}

export default function AuthRobot3D({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`auth-robot-3d ${compact ? 'auth-robot-3d--compact' : ''}`}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0.2, 0.55, 3.4], fov: compact ? 42 : 38, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={['#020b14']} />
        <fog attach="fog" args={['#020b14', 4.5, 12]} />
        <Suspense fallback={null}>
          <SceneLights />
          <DataField />
          <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.15}>
            <ThinkerRobot />
          </Float>
          <Environment preset="night" />
        </Suspense>
      </Canvas>
    </div>
  );
}
