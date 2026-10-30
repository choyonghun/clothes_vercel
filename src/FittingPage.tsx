import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ─── 타입 정의 ────────────────────────────────────────────────
interface BodyData {
  height: number | "";
  shoulderWidth: number | "";
  armLength: number | "";
  legLength: number | "";
  bodyDepth: number | "";
  legThickness: number | "";
  waistWidth: number | "";
  hipWidth: number | "";
}
interface ClothData {
  shoulder: number | "";
  totalLength: number | "";
  sleeveLength: number | "";
}
interface PantsData {
  pantsLength: number | "";
  waist: number | "";
  thighThickness: number | "";
  rise: number | "";
}
interface SkirtData {
  skirtLength: number | "";
  waist: number | "";
}
interface DressData {
  shoulder: number | "";
  totalLength: number | "";
  sleeveLength: number | "";
  waist: number | "";
}

type OutfitType = "separate" | "dress";
type BottomType = "pants" | "skirt";

interface FitMessage {
  category: string;
  message: string;
  level: "ok" | "info" | "warning" | "danger";
}

// ─── 신체 형상 (마네킹과 옷 모델이 같은 값을 공유) ─────────────
// 옷 모델이 마네킹과 다른 공식으로 위치/두께를 따로 계산하면 체형이 바뀔 때(어린이, 뚱뚱한 체형 등)
// 몸이 옷을 뚫고 나오므로, 모든 치수는 여기서 한 번만 계산해 함께 사용함
// 어깨 평면(원판)에서 목 원기둥으로 바로 이어지면 폭이 급격히 좁아져 V넥처럼 파여 보이므로,
// 그 사이를 완만하게 좁히는 경사(어깨) 구간의 높이
const SHOULDER_SLOPE = 0.03;
// 옷이 몸 표면에서 떨어지는 최소 여유. 옷 치수가 몸보다 작아도 화면에선 몸에 붙어 늘어난 것처럼 보이게 하고,
// 작다는 사실은 핏 가이드가 알려줌
const EASE = 0.008;

interface Ring { y: number; rx: number; rz: number }

// x = ±d 에 있는 반지름 r 원기둥 두 개(양 다리)를 모두 감싸는 타원.
// 폭만 d + r 로 맞추고 두께를 r 로 두면 다리 앞뒤가 타원 밖으로 삐져나오므로 원 둘레 점들로 두께를 구함
function legsEnclosure(d: number, r: number) {
  const rx = (d + r) * 1.08;
  let rz = r;
  for (let i = 1; i < 16; i++) {
    const a = i / 16 * Math.PI, x = d + r * Math.cos(a);
    rz = Math.max(rz, r * Math.sin(a) / Math.sqrt(1 - (x / rx) ** 2));
  }
  return { rx, rz };
}
type BodyShape = ReturnType<typeof getBodyShape>;

function getBodyShape(body: BodyData) {
  const h = Number(body.height || 175) / 100;
  const sw = Number(body.shoulderWidth || 45) / 100;
  const arm = Number(body.armLength || 60) / 100;
  const depth = Math.max(.1, Number(body.bodyDepth || 13) / 100);
  const thigh = Math.max(.03, Number(body.legThickness || 6) / 100);
  // 머리 크기는 키에 정비례하지 않음 (어린이는 몸에 비해 머리가 큼) → 제곱근 비율로 조절
  const headScale = Math.min(1.05, Math.max(.7, Math.sqrt(h / 1.75)));
  const head = .25 * headScale, neck = .065 * h / 1.75;
  const shoulderY = h - head - neck;
  // 다리 길이가 키에 비해 너무 길면 몸통 높이가 음수/0이 되어 가슴·허리 위치가 어깨 위로 뒤집히므로 다리 쪽을 제한
  const leg = Math.min(Number(body.legLength || 85) / 100, shoulderY - .22);
  const torso = shoulderY - leg;
  const chest = Math.max(.1, sw * .42);
  // waistWidth/hipWidth는 하의 치수(허리 너비)와 같은 "전체 폭" 단위로 입력받으므로
  // 어깨(sw/2)와 동일하게 절반을 나눠 반지름으로 변환해야 하의와 두께가 일치함
  const waist = Math.max(.08, body.waistWidth ? Number(body.waistWidth) / 100 / 2 : chest * .72);
  const hip   = Math.max(.08, body.hipWidth   ? Number(body.hipWidth)   / 100 / 2 : chest * .84);
  const chestY = leg + torso * .68, waistY = leg + torso * .33, hipY = leg + torso * .12;
  const upperZ = Math.max(.2, depth / (chest * 2)), lowerZ = Math.max(.2, depth / (hip * 2));
  // 팔 굵기도 체형(허벅지 두께)에 맞춰 조절 (뚱뚱한 체형에 아동용 팔이 붙지 않도록)
  const armR = .04 * Math.min(1.5, Math.max(.75, thigh / .06));
  const armX = sw * .52 + .02;
  const legX = hip * .48;
  // 마네킹 몸통 원기둥(어깨→가슴→허리→골반→가랑이)을 그대로 선형보간한 높이 y의 단면 반지름
  const segments: [number, number, number, number, number][] = [
    [shoulderY, chestY, sw / 2, chest, upperZ],
    [chestY, waistY, chest, waist, upperZ],
    [waistY, hipY, waist, hip, lowerZ],
    [hipY, leg, hip, hip * .94, lowerZ],
  ];
  const torsoAt = (y: number) => {
    const cy = Math.min(shoulderY, Math.max(leg, y));
    let rx = 0, rz = 0;
    for (const [y0, y1, r0, r1, z] of segments) {
      if (cy > y0 || cy < y1) continue;
      const r = r1 + (r0 - r1) * (cy - y1) / (y0 - y1);
      rx = Math.max(rx, r); rz = Math.max(rz, r * z);
    }
    return { rx, rz };
  };
  // 가랑이 아래는 두 다리를 감싸는 외곽 폭
  const bodyAt = (y: number) => y >= leg ? torsoAt(y) : legsEnclosure(legX, thigh);
  return { h, sw, arm, depth, thigh, headScale, head, neck, shoulderY, leg, torso, chest, waist, hip,
           chestY, waistY, hipY, upperZ, lowerZ, armR, armX, legX, torsoAt, bodyAt };
}

// ─── 타원 단면 링들을 이어 붙인 옷 껍데기 ──────────────────────
// 원기둥 하나로는 몸의 굴곡(가슴·허리·골반)과 몸통 두께를 따라갈 수 없어 몸이 옷을 뚫고 나오므로,
// 높이별 단면(타원)을 지정해 몸을 감싸는 형태로 만듦
function Shell({ rings, material }: { rings: Ring[]; material: React.ReactNode }) {
  const key = JSON.stringify(rings);
  const geometry = useMemo(() => {
    const SEG = 40;
    const pos: number[] = [], idx: number[] = [];
    rings.forEach(({ y, rx, rz }) => {
      for (let i = 0; i <= SEG; i++) {
        const a = i / SEG * Math.PI * 2;
        pos.push(Math.sin(a) * rx, y, Math.cos(a) * rz);
      }
    });
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < SEG; i++) {
      const a = r * (SEG + 1) + i, b = a + SEG + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry}>{material}</mesh>;
}

// 위→아래로 정렬된 링 목록에서 높이 y의 단면을 선형보간 (범위 밖이면 null)
function ringAt(rings: Ring[] | undefined, y: number) {
  if (!rings) return null;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    if (y > a.y || y < b.y) continue;
    const t = a.y === b.y ? 0 : (a.y - y) / (a.y - b.y);
    return { rx: a.rx + (b.rx - a.rx) * t, rz: a.rz + (b.rz - a.rz) * t };
  }
  return null;
}

// 몸 단면 + 여유를 최소값으로 하는 옷 단면. 옷이 더 넉넉하면 두께도 몸의 폭:두께 비율대로 같이 커짐
// under: 안쪽에 입은 옷(하의)의 겉면. 상의가 하의와 같은 면에 그려지면 겹친 부분이 깜빡이거나(z-fighting)
// 하의 허리밴드가 상의를 뚫고 나오므로, 상의는 항상 그 바깥에 놓이게 함
function fitRing(shape: BodyShape, y: number, designRx: number, under?: Ring[]): Ring {
  const b = shape.bodyAt(y), u = ringAt(under, y);
  const inner = u ? { rx: Math.max(b.rx, u.rx), rz: Math.max(b.rz, u.rz) } : b;
  const rx = Math.max(designRx, inner.rx + EASE);
  return { y, rx, rz: Math.max(inner.rz + EASE, rx * b.rz / b.rx) };
}

// 상의/원피스 상체: 목 → 어깨 경사 → 가슴 → 허리 → 골반 → 밑단
function topRings(shape: BodyShape, halfW: number, hemY: number, under?: Ring[]): Ring[] {
  const { shoulderY } = shape;
  const neckR = .06 * shape.headScale + EASE;
  const len = Math.max(.01, shoulderY - hemY);
  const ys = [shoulderY, shape.chestY, shape.waistY, shape.hipY, shape.leg, ...(under || []).map((r) => r.y)]
    .filter((y) => y > hemY && y <= shoulderY).sort((a, b) => b - a);
  // 밑단으로 갈수록 살짝 좁아지는 디자인 실루엣
  const design = (y: number) => halfW * (1 - .06 * (shoulderY - y) / len);
  return [
    // 경사 구간을 어깨선 "위"에 두어야 마네킹의 평평한 어깨 윗면이 옷을 뚫지 않음
    { y: shoulderY + SHOULDER_SLOPE, rx: neckR, rz: neckR },
    ...ys.map((y) => fitRing(shape, y, design(y), under)),
    fitRing(shape, hemY, design(hemY), under),
  ];
}

// 치마/원피스 치마: 위에서 아래로 펼쳐지되, 골반·다리 중 가장 넓은 곳보다 좁아지지 않도록 함
// top: 허리선 단면. 두께 비율도 허리선에서 시작해 밑단으로 갈수록 둥글게 펼쳐져야 옆에서 볼 때 허리에 단차가 생기지 않음
function skirtRings(shape: BodyShape, top: Ring, hemY: number, flare: number): Ring[] {
  const N = 16, rings: Ring[] = [];
  const ratio0 = top.rz / top.rx;
  let maxRx = 0, maxRz = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = top.y - (top.y - hemY) * t;
    const b = shape.bodyAt(y);
    maxRx = Math.max(maxRx, b.rx); maxRz = Math.max(maxRz, b.rz);
    const rx = Math.max(top.rx + flare * t, maxRx + EASE);
    rings.push({ y, rx, rz: Math.max(maxRz + EASE, rx * (ratio0 + (.8 - ratio0) * t)) });
  }
  return rings;
}

function Sleeves({ shape, sleeveLen, material }: { shape: BodyShape; sleeveLen: number; material: React.ReactNode }) {
  const r = Math.max(.045, shape.armR + .008);
  return <>
    {([-1, 1] as const).map((side) => (
      <mesh key={side} position={[side * shape.armX, shape.shoulderY - sleeveLen / 2, 0]}>
        <cylinderGeometry args={[r, r * .85, sleeveLen, 16]} />{material}
      </mesh>
    ))}
  </>;
}

function Collar({ shape, material }: { shape: BodyShape; material: React.ReactNode }) {
  // 목 원기둥(반지름 .06·headScale)보다 커야 목이 옷깃을 뚫고 나오지 않음
  const r = .06 * shape.headScale + EASE, h = shape.neck * .6;
  return <mesh position={[0, shape.shoulderY + SHOULDER_SLOPE + h / 2, 0]}>
    <cylinderGeometry args={[r, r, h, 24, 1, true]} />{material}
  </mesh>;
}

const clothMat = (color: string) => <meshStandardMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />;

// ─── 바지 모델 ────────────────────────────────────────────────
function getPantsLayout(shape: BodyShape, pants: PantsData) {
  const pantsLen = Number(pants.pantsLength   || 85) / 100;
  const waistW   = Number(pants.waist         || 34) / 100;
  const legRadius = Math.max(Number(pants.thighThickness || 7) / 100, shape.thigh + EASE);
  const hipH     = Number(pants.rise          || 12) / 100;
  const waistH   = 0.04;
  // 마네킹의 실제 다리 시작점(가랑이)에 앵커링하고, 허리는 그 위로 밑위+허리밴드만큼만 올라가도록 계산
  // 바지 길이는 순수 다리(인심) 길이이고, 밑위는 크로치 위로 별도로 얹히는 구간이라 다리 길이를 갉아먹지 않음
  const legStartY = shape.leg;
  const hipTopY  = legStartY + waistH + hipH;
  // 바지가 다리보다 길면 바닥 아래로 뚫고 내려가지 않도록 바닥에서 멈춤 (끌림 여부는 핏 가이드에서 안내)
  const legLen   = Math.max(0.05, Math.min(pantsLen, legStartY - .005));
  // 허리밴드~밑위: 허리 치수에서 시작해 골반을 덮을 만큼 넓어짐 (예전처럼 아래로 좁아지면 골반이 뚫고 나옴)
  const hipRings = [hipTopY, hipTopY - waistH, shape.waistY, shape.hipY, legStartY]
    .filter((y) => y <= hipTopY && y >= legStartY).sort((a, b) => b - a)
    .map((y) => fitRing(shape, y, waistW / 2));
  // 상의가 덮어야 하는 바지 겉면 (가랑이 아래는 두 다리 바깥 폭)
  const legOuter = legsEnclosure(shape.legX, legRadius);
  const outer: Ring[] = [...hipRings, { y: legStartY - .001, ...legOuter }, { y: legStartY - legLen, ...legOuter }];
  return { legRadius, legStartY, legLen, hipRings, outer };
}

function PantsModel({ pants, body, color }: { pants: PantsData; body: BodyData; color: string }) {
  const shape = getBodyShape(body);
  const { legRadius, legStartY, legLen, hipRings } = getPantsLayout(shape, pants);

  const mat = clothMat(color);
  return (
    <group>
      <Shell rings={hipRings} material={mat} />
      {/* capsule은 끝이 반구라 반지름이 0인 점에서 시작해 밑위와 만나면 잘록하게 끊겨 보이므로,
          다리도 원기둥으로 만들어 밑위와 같은 굵기로 이어지게 함 */}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[side * shape.legX, legStartY - legLen / 2, 0]}>
          <cylinderGeometry args={[legRadius, legRadius * .85, legLen, 20]} />{mat}
        </mesh>
      ))}
    </group>
  );
}

// ─── 치마 모델 ────────────────────────────────────────────────
function getSkirtLayout(shape: BodyShape, skirt: SkirtData) {
  const skirtLen = Number(skirt.skirtLength  || 55) / 100;
  const waistW   = Number(skirt.waist        || 34) / 100;
  const waistH   = 0.04;
  // 마네킹의 실제 허리 높이에 맞춰 배치 (엉덩이 아래로 처지지 않도록)
  const waistTopY = shape.waistY;
  const hemY      = Math.max(.01, waistTopY - skirtLen);
  const band      = fitRing(shape, waistTopY, waistW / 2);
  const bandRings: Ring[] = [{ ...band, rx: band.rx + .004, rz: band.rz + .004 },
                             { ...band, y: waistTopY - waistH, rx: band.rx + .004, rz: band.rz + .004 }];
  // 치마 본체 (위→아래로 펼쳐짐)
  const bodyRings = skirtRings(shape, band, hemY, .12);
  const outer = [bandRings[0], ...bodyRings.slice(1).map((r) =>
    r.y >= bandRings[1].y ? { ...r, rx: Math.max(r.rx, bandRings[0].rx), rz: Math.max(r.rz, bandRings[0].rz) } : r)];
  return { bandRings, bodyRings, outer };
}

function SkirtModel({ skirt, body, color }: { skirt: SkirtData; body: BodyData; color: string }) {
  const { bandRings, bodyRings } = getSkirtLayout(getBodyShape(body), skirt);
  const mat = clothMat(color);
  return (
    <group>
      {/* 허리밴드 */}
      <Shell rings={bandRings} material={mat} />
      <Shell rings={bodyRings} material={mat} />
    </group>
  );
}

// ─── 상의 모델 ───────────────────────────────────────────────
// under: 함께 입은 하의의 겉면 (상의를 하의 밖으로 빼 입은 모양으로 그림)
function SweaterModel({ cloth, body, color, under }: { cloth: ClothData; body: BodyData; color: string; under?: Ring[] }) {
  const shape = getBodyShape(body);
  const shoulderW  = Number(cloth.shoulder    || 55) / 100;
  const totalLen   = Number(cloth.totalLength || 70) / 100;
  const sleeveLen  = Number(cloth.sleeveLength || 62) / 100;
  const hemY       = Math.max(.02, shape.shoulderY - totalLen);

  const mat = clothMat(color);
  return (
    <group>
      {/* 옷 어깨 너비 중 양쪽 소매 굵기를 뺀 만큼이 몸판 폭 */}
      <Shell rings={topRings(shape, shoulderW / 2 - .045, hemY, under)} material={mat} />
      <Collar shape={shape} material={mat} />
      {/* 소매: 어깨선(shoulderY)에서 마네킹 팔 위치 그대로 늘어뜨림 */}
      <Sleeves shape={shape} sleeveLen={sleeveLen} material={mat} />
    </group>
  );
}

// ─── 원피스 모델 ─────────────────────────────────────────────
function DressModel({ dress, body, color }: { dress: DressData; body: BodyData; color: string }) {
  const shape = getBodyShape(body);
  const shoulderW  = Number(dress.shoulder    || 55)  / 100;
  const totalLen   = Number(dress.totalLength || 120) / 100;
  const sleeveLen  = Number(dress.sleeveLength || 62) / 100;
  const waistW     = Number(dress.waist        || 34) / 100;
  const hemY       = Math.max(.01, shape.shoulderY - totalLen);
  // 상체는 실제 허리선(waistY)까지, 치마는 허리선부터 시작 (예전엔 가랑이 높이에서 치마가 시작돼 허리선이 너무 낮았음)
  const bodiceEndY = Math.max(hemY, shape.waistY);
  const waistRing  = fitRing(shape, shape.waistY, waistW / 2);
  const bodice     = topRings(shape, shoulderW / 2 - .045, bodiceEndY);
  // 허리선에서는 원피스 허리 치수로 잡아줘야 상체와 치마가 단차 없이 이어짐
  if (hemY < shape.waistY) bodice[bodice.length - 1] = waistRing;

  const mat = clothMat(color);
  return (
    <group>
      <Shell rings={bodice} material={mat} />
      <Collar shape={shape} material={mat} />
      <Sleeves shape={shape} sleeveLen={sleeveLen} material={mat} />
      {hemY < shape.waistY && (
        <Shell rings={skirtRings(shape, waistRing, hemY, .13)} material={mat} />
      )}
    </group>
  );
}

// ─── 사람형 마네킹과 신체 치수 가이드 ─────────────────────────
function Limb({ from, to, top, bottom, material }: {
  from: [number, number, number]; to: [number, number, number];
  top: number; bottom: number; material: React.ReactNode;
}) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const middle: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  return <mesh position={middle} rotation={[0, 0, -Math.atan2(dx, dy)]}>
    <cylinderGeometry args={[bottom, top, length, 20, 4]} />{material}
  </mesh>;
}

function Mannequin({ body }: { body: BodyData }) {
  const { h, sw, arm, thigh, headScale, head, neck, shoulderY, leg, chest, waist, hip,
          chestY, waistY, hipY, upperZ, lowerZ, armR, armX: ax } = getBodyShape(body);
  const skin = <meshStandardMaterial color="#d5b5a6" roughness={.7} metalness={.03} />;
  return <group>
    {/* 머리·얼굴: 성인(머리 .25) 기준 좌표로 만들고 키에 맞춰 통째로 축소/확대 */}
    <group position={[0, h - head / 2, 0]} scale={headScale}>
      <mesh scale={[.83, 1.08, .78]}><sphereGeometry args={[.125, 32, 24]} />{skin}</mesh>
      {/* 머리카락: 이마는 살짝 드러나고 뒤통수 쪽으로 조금 더 내려오는 일반적인 헤어라인 (앞=-Z 방향으로 살짝 기울여 표현) */}
      <mesh rotation={[.28, 0, 0]} scale={[.88, 1.1, .82]}>
        <sphereGeometry args={[.132, 32, 24, 0, Math.PI * 2, 0, Math.PI * .44]} />
        <meshStandardMaterial color="#3b2a1f" roughness={.85} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map(side => <mesh key={`ear-${side}`} position={[side * .105, 0, 0]} scale={[.45, .75, .32]}><sphereGeometry args={[.032, 16, 12]} />{skin}</mesh>)}

      {/* 눈·눈썹·코·입 (얼굴 앞쪽 = -Z) */}
      {[-1, 1].map(side => (
        <mesh key={`eye-${side}`} position={[side * .045, .012, -.098]}>
          <sphereGeometry args={[.011, 12, 10]} />
          <meshStandardMaterial color="#241a16" roughness={.4} />
        </mesh>
      ))}
      {[-1, 1].map(side => (
        <mesh key={`brow-${side}`} position={[side * .045, .028, -.093]}>
          <boxGeometry args={[.045, .008, .01]} />
          <meshStandardMaterial color="#3b2a1f" roughness={.85} />
        </mesh>
      ))}
      <mesh position={[0, -.01, -.104]} scale={[.35, .5, .4]}><sphereGeometry args={[.022, 16, 12]} />{skin}</mesh>
      <mesh position={[0, -.045, -.097]}>
        <boxGeometry args={[.05, .012, .01]} />
        <meshStandardMaterial color="#a8574f" roughness={.6} />
      </mesh>
    </group>

    <mesh position={[0, h - head - neck / 2, 0]}><cylinderGeometry args={[.052 * headScale, .06 * headScale, neck, 24]} />{skin}</mesh>

    {/* 흉곽·허리·골반: 입력한 어깨 너비와 몸통 두께를 실루엣에 반영 */}
    <mesh position={[0, (shoulderY + chestY) / 2, 0]} scale={[1, 1, upperZ]}><cylinderGeometry args={[sw / 2, chest, shoulderY - chestY, 32, 4]} />{skin}</mesh>
    <mesh position={[0, (chestY + waistY) / 2, 0]} scale={[1, 1, upperZ]}><cylinderGeometry args={[chest, waist, chestY - waistY, 32, 4]} />{skin}</mesh>
    <mesh position={[0, (waistY + hipY) / 2, 0]} scale={[1, 1, lowerZ]}><cylinderGeometry args={[waist, hip, waistY - hipY, 32, 4]} />{skin}</mesh>
    <mesh position={[0, (hipY + leg) / 2, 0]} scale={[1, 1, lowerZ]}><cylinderGeometry args={[hip, hip * .94, hipY - leg, 32, 3]} />{skin}</mesh>

    {([-1, 1] as const).map(side => {
      // 팔이 굽지 않고 어깨에서 손목까지 일직선으로 곧게 늘어지도록 x/z를 고정
      const armX = side * ax;
      const shoulder: [number, number, number] = [armX, shoulderY - .035, 0];
      const elbow: [number, number, number] = [armX, shoulderY - arm * .48, 0];
      const wrist: [number, number, number] = [armX, shoulderY - arm * .96, 0];
      const k = armR / .04;
      // 팔 반지름(armR)은 소매 반지름(armR + .008 이상)보다 얇게 유지해서 소매 밖으로 삐져나오지 않도록 함
      return <group key={`arm-${side}`}><Limb from={shoulder} to={elbow} top={armR} bottom={.85 * armR} material={skin} /><mesh position={elbow}><sphereGeometry args={[.9 * armR, 20, 16]} />{skin}</mesh><Limb from={elbow} to={wrist} top={.85 * armR} bottom={.65 * armR} material={skin} /><mesh position={[wrist[0], wrist[1] - .035 * k, 0]} scale={[.7, 1.25, .62]}><sphereGeometry args={[.038 * k, 16, 12]} />{skin}</mesh></group>;
    })}
    {([-1, 1] as const).map(side => {
      const top: [number, number, number] = [side * hip * .48, leg, 0], knee: [number, number, number] = [side * hip * .5, leg * .49, .008], ankle: [number, number, number] = [side * hip * .47, .07, 0];
      return <group key={`leg-${side}`}><Limb from={top} to={knee} top={thigh} bottom={thigh * .78} material={skin} /><mesh position={knee}><sphereGeometry args={[thigh * .79, 20, 16]} />{skin}</mesh><Limb from={knee} to={ankle} top={thigh * .67} bottom={thigh * .46} material={skin} /><mesh position={[ankle[0], .035, -.055]} scale={[.8, .48, 1.55]}><sphereGeometry args={[thigh * .75, 20, 14]} />{skin}</mesh></group>;
    })}

  </group>;
}

// ─── 버튼 헬퍼 ───────────────────────────────────────────────
function ToggleBtn({ label, active, onClick, color = "#1a73e8" }: {
  label: string; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "6px 0", fontSize: "12px", fontWeight: "bold",
      backgroundColor: active ? color : "#f1f3f4",
      color: active ? "#fff" : "#5f6368",
      border: `1px solid ${active ? color : "#dadce0"}`,
      borderRadius: "6px", cursor: "pointer", transition: "all 0.15s"
    }}>{label}</button>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function FittingPage({ userId, username, onLogout }: { userId: number; username: string; onLogout: () => void }) {
  const [body, setBody]   = useState<BodyData>({ height: 175, shoulderWidth: 45, armLength: 60, legLength: 85, bodyDepth: 13, legThickness: 6, waistWidth: 32, hipWidth: 38 });
  const [cloth, setCloth] = useState<ClothData>({ shoulder: 55, totalLength: 70, sleeveLength: 62 });
  const [pants, setPants] = useState<PantsData>({ pantsLength: 95, waist: 34, thighThickness: 7, rise: 12 });
  const [skirt, setSkirt] = useState<SkirtData>({ skirtLength: 55, waist: 34 });
  const [dress, setDress] = useState<DressData>({ shoulder: 55, totalLength: 120, sleeveLength: 62, waist: 34 });

  const [clothColor, setClothColor] = useState("#ff7043");
  const [pantsColor, setPantsColor] = useState("#1565c0");
  const [skirtColor, setSkirtColor] = useState("#e91e63");
  const [dressColor, setDressColor] = useState("#9c27b0");

  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [outfitType, setOutfitType] = useState<OutfitType>("separate");
  const [bottomType, setBottomType] = useState<BottomType>("pants");
  const [topWorn, setTopWorn] = useState(true);
  const [bottomWorn, setBottomWorn] = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [fitMessages, setFitMessages] = useState<FitMessage[]>([]);
  const [fitLoading, setFitLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(`/api/bodycheck/allstats/${userId}`);
        const { body: sb, cloth: sc, pants: sp } = res.data;
        if (sb && sb.height)      setBody(sb);
        if (sc && sc.shoulder)  { setCloth(sc); if (sc.color) setClothColor(sc.color); }
        if (sp && sp.pantsLength) { setPants(sp); if (sp.color) setPantsColor(sp.color); }
      } catch (e) { console.error("데이터 로딩 실패:", e); }
    };
    fetchData();
  }, [userId]);

  const handleChange = (setter: any, prev: any, e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setter({ ...prev, [e.target.name]: v === "" ? "" : Number(v) });
  };

  const analyzeFit = async () => {
    setFitLoading(true);
    try {
      const res = await axios.post("/api/bodycheck/fitguide", {
        body,
        cloth: outfitType === "separate" && topWorn ? cloth : null,
        pants: outfitType === "separate" && bottomType === "pants" && bottomWorn ? pants : null,
      });
      setFitMessages(res.data);
    } catch (e) {
      console.error("핏 분석 실패:", e);
    } finally {
      setFitLoading(false);
    }
  };

  const sendToServer = async () => {
    const missingBody = Object.keys(bodyLabels).some((k) => body[k as keyof BodyData] === "");
    if (missingBody) {
      setBodyExpanded(true);
      alert("신체 치수는 필수 입력 항목입니다. 빠진 값을 채워주세요.");
      return;
    }
    try {
      await axios.post("/api/bodycheck/body",  { ...body,  userId });
      await axios.post("/api/bodycheck/cloth", { ...cloth, userId, color: clothColor });
      await axios.post("/api/bodycheck/pants", { ...pants, userId, color: pantsColor });
      alert("데이터 전송 및 저장 성공!");
    } catch (error: any) {
      const status = error?.response?.status;
      const data   = error?.response?.data;
      // 검증 실패(400)는 { 필드명: 메시지 } 객체로 오므로 그대로 문자열에 넣으면 "[object Object]"로 보임
      const msg    = data && typeof data === "object"
        ? Object.entries(data).map(([field, m]) => `${field}: ${m}`).join("\n")
        : data || error?.message || "알 수 없는 오류";
      alert(`서버 저장 실패 [${status}]: ${msg}`);
    }
  };

  const bodyPresets: Record<string, BodyData> = {
    마른:   { height: 175, shoulderWidth: 38, armLength: 57, legLength: 85, bodyDepth: 10, legThickness: 5, waistWidth: 26, hipWidth: 34 },
    평균:   { height: 175, shoulderWidth: 45, armLength: 60, legLength: 85, bodyDepth: 13, legThickness: 6, waistWidth: 32, hipWidth: 38 },
    뚱뚱한: { height: 175, shoulderWidth: 54, armLength: 63, legLength: 85, bodyDepth: 19, legThickness: 8, waistWidth: 42, hipWidth: 50 },
  };

  const bodyLabels:  Record<string, string> = { height:"키", shoulderWidth:"어깨 너비", armLength:"팔 길이", legLength:"다리 길이", bodyDepth:"몸통 두께", legThickness:"허벅지 두께", waistWidth:"허리 너비", hipWidth:"엉덩이 너비" };
  const clothLabels: Record<string, string> = { shoulder:"옷 어깨", totalLength:"옷 총장", sleeveLength:"소매 길이" };
  const pantsLabels: Record<string, string> = { pantsLength:"바지 길이", waist:"허리 너비", rise:"밑위 길이", thighThickness:"허벅지 두께" };
  const skirtLabels: Record<string, string> = { skirtLength:"치마 길이", waist:"허리 너비" };
  const dressLabels: Record<string, string> = { shoulder:"어깨", totalLength:"원피스 총장", sleeveLength:"소매 길이", waist:"허리 너비" };

  const inputRow = (label: string, name: string, value: any, onChange: any, required = false) => (
    <div key={name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"6px" }}>
      <label style={{ fontSize:"13px", fontWeight:600, color:"#5f6368", whiteSpace:"nowrap", marginRight:"8px" }}>
        {label}{required && <span style={{ color:"#d93025" }}> *</span>}
      </label>
      <div style={{ display:"flex", alignItems:"center", gap:"4px" }}>
        <input name={name} type="number" value={value} required={required}
          style={{ width:"70px", padding:"5px 8px", borderRadius:"6px", border:`1px solid ${required && value === "" ? "#d93025" : "#dadce0"}`, fontSize:"13px", textAlign:"right" }}
          onChange={onChange} />
        <span style={{ fontSize:"12px", color:"#9aa0a6" }}>cm</span>
      </div>
    </div>
  );

  const colorRow = (label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"6px" }}>
      <label style={{ fontSize:"13px", fontWeight:600, color:"#5f6368" }}>{label}</label>
      <input type="color" value={value} onChange={onChange}
        style={{ width:"60px", height:"30px", border:"1px solid #dadce0", borderRadius:"6px", cursor:"pointer", padding:"2px" }} />
    </div>
  );

  const sectionTitle = (icon: string, text: string, color: string, border: string) => (
    <h3 style={{ marginTop:"16px", color, borderBottom:`2px solid ${border}`, paddingBottom:"8px", marginBottom:"8px" }}>{icon} {text}</h3>
  );

  const collapsibleSectionTitle = (icon: string, text: string, color: string, border: string, expanded: boolean, onToggle: () => void) => (
    <h3 onClick={onToggle} style={{
      marginTop:"16px", color, borderBottom:`2px solid ${border}`, paddingBottom:"8px", marginBottom: expanded ? "8px" : "0",
      cursor:"pointer", userSelect:"none", display:"flex", alignItems:"center", justifyContent:"space-between"
    }}>
      <span>{icon} {text} <span style={{ fontSize:"11px", fontWeight:400, color:"#d93025" }}>(필수)</span></span>
      <span style={{ fontSize:"12px" }}>{expanded ? "▲" : "▼"}</span>
    </h3>
  );

  // 상의 안쪽에 깔리는 하의 겉면 (상의가 하의와 겹쳐 깜빡이거나 하의 허리밴드에 뚫리지 않도록)
  const topUnderLayer = outfitType === "separate" && bottomWorn
    ? (bottomType === "pants" ? getPantsLayout(getBodyShape(body), pants).outer : getSkirtLayout(getBodyShape(body), skirt).outer)
    : undefined;

  return (
    <div style={{ display:"flex", padding:"20px", gap:"30px", backgroundColor:"#f8f9fa", minHeight:"100vh" }}>

      {/* ── 사이드바 ── */}
      <div style={{ minWidth:"320px", background:"white", padding:"20px", borderRadius:"16px", boxShadow:"0 10px 25px rgba(0,0,0,0.05)" }}>

        {/* 신체 치수 (자주 바뀌지 않으므로 기본은 접힘, 값 자체는 필수 입력) */}
        {collapsibleSectionTitle("🧍", "신체 치수", "#1a73e8", "#e8f0fe", bodyExpanded, () => setBodyExpanded((v) => !v))}
        {bodyExpanded && (
          <>
            <div style={{ display:"flex", gap:"6px", marginBottom:"10px" }}>
              {Object.keys(bodyPresets).map((label) => (
                <ToggleBtn key={label} label={label} active={activePreset === label}
                  onClick={() => { setBody(bodyPresets[label]); setActivePreset(label); }} />
              ))}
            </div>
            {Object.keys(bodyLabels).map((k) => inputRow(bodyLabels[k], k, body[k as keyof BodyData], (e: any) => handleChange(setBody, body, e), true))}
          </>
        )}

        {/* 복장 선택 */}
        {sectionTitle("👗", "복장 선택", "#6a1b9a", "#ede7f6")}
        <div style={{ display:"flex", gap:"6px", marginBottom:"10px" }}>
          {/* 착용 상태(상의/하의 벗기) 토글은 "상의+하의" 모드에서만 보이므로, 복장 종류를 바꿀 때마다
              항상 다 입은 상태로 초기화해야 원피스 ↔ 상의+하의를 오갈 때 옷이 빠진 채로 남지 않음 */}
          <ToggleBtn label="상의 + 하의" active={outfitType === "separate"} onClick={() => { setOutfitType("separate"); setTopWorn(true); setBottomWorn(true); }} color="#1a73e8" />
          <ToggleBtn label="원피스"      active={outfitType === "dress"}    onClick={() => { setOutfitType("dress"); setTopWorn(true); setBottomWorn(true); }} color="#6a1b9a" />
        </div>

        {/* 상의+하의 모드 */}
        {outfitType === "separate" && (
          <>
            {sectionTitle("🧥", "착용 상태", "#5f6368", "#e8eaed")}
            <div style={{ display:"flex", gap:"6px", marginBottom:"10px" }}>
              <ToggleBtn label={topWorn ? "상의 벗기" : "상의 입기"} active={topWorn} onClick={() => setTopWorn((worn) => !worn)} color="#d93025" />
              <ToggleBtn label={bottomWorn ? "하의 벗기" : "하의 입기"} active={bottomWorn} onClick={() => setBottomWorn((worn) => !worn)} color="#2e7d32" />
            </div>
            {sectionTitle("👕", "상의 치수", "#d93025", "#fce8e6")}
            {colorRow("상의 색상", clothColor, (e) => setClothColor(e.target.value))}
            {Object.keys(clothLabels).map((k) => inputRow(clothLabels[k], k, cloth[k as keyof ClothData], (e: any) => handleChange(setCloth, cloth, e)))}

            {sectionTitle("👖", "하의 치수", "#2e7d32", "#e8f5e9")}
            <div style={{ display:"flex", gap:"6px", marginBottom:"10px" }}>
              <ToggleBtn label="바지" active={bottomType === "pants"} onClick={() => setBottomType("pants")} color="#1565c0" />
              <ToggleBtn label="치마" active={bottomType === "skirt"} onClick={() => setBottomType("skirt")} color="#e91e63" />
            </div>

            {bottomType === "pants" && (
              <>
                {colorRow("바지 색상", pantsColor, (e) => setPantsColor(e.target.value))}
                {Object.keys(pantsLabels).map((k) => inputRow(pantsLabels[k], k, pants[k as keyof PantsData], (e: any) => handleChange(setPants, pants, e)))}
              </>
            )}
            {bottomType === "skirt" && (
              <>
                {colorRow("치마 색상", skirtColor, (e) => setSkirtColor(e.target.value))}
                {Object.keys(skirtLabels).map((k) => inputRow(skirtLabels[k], k, skirt[k as keyof SkirtData], (e: any) => handleChange(setSkirt, skirt, e)))}
              </>
            )}
          </>
        )}

        {/* 원피스 모드 */}
        {outfitType === "dress" && (
          <>
            {sectionTitle("👗", "원피스 치수", "#6a1b9a", "#ede7f6")}
            {colorRow("원피스 색상", dressColor, (e) => setDressColor(e.target.value))}
            {Object.keys(dressLabels).map((k) => inputRow(dressLabels[k], k, dress[k as keyof DressData], (e: any) => handleChange(setDress, dress, e)))}
          </>
        )}

        <button onClick={sendToServer} style={{ marginTop:"30px", width:"100%", padding:"14px", backgroundColor:"#1a73e8", color:"white", border:"none", borderRadius:"8px", cursor:"pointer", fontWeight:"bold" }}>
          측정 데이터 서버 저장
        </button>
      </div>

      {/* ── 3D 캔버스 ── */}
      <div style={{ flex:1, height:"850px", background:"#ffffff", borderRadius:"20px", overflow:"hidden", boxShadow:"0 15px 35px rgba(0,0,0,0.1)" }}>
        {/* 마네킹 얼굴이 -Z 방향이므로 카메라·조명도 -Z 쪽에 둬야 처음 화면에 뒷모습이 아닌 앞모습이 보임 */}
        <Canvas camera={{ position:[0, 1.2, -3], fov:40 }}>
          <color attach="background" args={["#ffffff"]} />
          <ambientLight intensity={1} />
          <pointLight position={[5, 5, -5]} intensity={1.5} />
          <Mannequin body={body} />
          {outfitType === "separate" && topWorn && <SweaterModel cloth={cloth} body={body} color={clothColor} under={topUnderLayer} />}
          {outfitType === "separate" && bottomWorn && bottomType === "pants" && <PantsModel pants={pants} body={body} color={pantsColor} />}
          {outfitType === "separate" && bottomWorn && bottomType === "skirt" && <SkirtModel skirt={skirt} body={body} color={skirtColor} />}
          {outfitType === "dress" && <DressModel dress={dress} body={body} color={dressColor} />}
          <OrbitControls target={[0, 1, 0]} />
          <gridHelper args={[20, 20, 0xeeeeee, 0xf5f5f5]} />
        </Canvas>
      </div>

      {/* ── 핏 가이드 패널 (오른쪽) ── */}
      <div style={{ width:"260px", background:"white", padding:"20px", borderRadius:"16px", boxShadow:"0 10px 25px rgba(0,0,0,0.05)", display:"flex", flexDirection:"column", gap:"12px" }}>
        {/* 헤더 */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"12px", paddingBottom:"10px", borderBottom:"1px solid #f0f0f0" }}>
          <div>
            <span style={{ fontWeight:"bold", color:"#1a73e8", fontSize:"16px" }}>{username}</span>
            <span style={{ color:"#5f6368", fontSize:"13px" }}>님 환영합니다!</span>
          </div>
          <button onClick={onLogout}
            style={{ padding:"5px 10px", fontSize:"12px", fontWeight:"bold", backgroundColor:"#fff1f0", color:"#d93025", border:"1px solid #ffccc7", borderRadius:"6px", cursor:"pointer" }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor="#d93025"; e.currentTarget.style.color="white"; }}
            onMouseOut={(e)  => { e.currentTarget.style.backgroundColor="#fff1f0"; e.currentTarget.style.color="#d93025"; }}>
            로그아웃
          </button>
        </div>

        <h3 style={{ margin:0, color:"#34a853", borderBottom:"2px solid #e8f5e9", paddingBottom:"8px", fontSize:"15px" }}>
          🔍 핏 가이드
        </h3>
        <p style={{ margin:0, fontSize:"12px", color:"#9aa0a6", lineHeight:"1.5" }}>
          현재 입력된 신체·옷 치수를 기반으로 핏을 분석합니다.
        </p>

        <button onClick={analyzeFit} disabled={fitLoading}
          style={{ width:"100%", padding:"12px", backgroundColor: fitLoading ? "#ccc" : "#34a853", color:"white", border:"none", borderRadius:"8px", cursor: fitLoading ? "default" : "pointer", fontWeight:"bold", fontSize:"13px" }}>
          {fitLoading ? "분석 중..." : "핏 분석 시작"}
        </button>

        {fitMessages.length === 0 && !fitLoading && (
          <div style={{ textAlign:"center", color:"#bdbdbd", fontSize:"12px", marginTop:"20px" }}>
            버튼을 눌러 분석을 시작하세요
          </div>
        )}

        {fitMessages.map((msg, i) => {
          const colors: Record<string, { bg: string; text: string; icon: string; border: string }> = {
            ok:      { bg:"#e8f5e9", text:"#2e7d32", icon:"✅", border:"#a5d6a7" },
            info:    { bg:"#e3f2fd", text:"#1565c0", icon:"ℹ️", border:"#90caf9" },
            warning: { bg:"#fff8e1", text:"#f57f17", icon:"⚠️", border:"#ffe082" },
            danger:  { bg:"#fce8e6", text:"#c62828", icon:"🚨", border:"#ef9a9a" },
          };
          const c = colors[msg.level] || colors.info;
          return (
            <div key={i} style={{ borderRadius:"10px", border:`1px solid ${c.border}`, backgroundColor: c.bg, padding:"10px 12px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" }}>
                <span style={{ fontSize:"14px" }}>{c.icon}</span>
                <span style={{ fontSize:"12px", fontWeight:"bold", color: c.text }}>{msg.category}</span>
              </div>
              <p style={{ margin:0, fontSize:"12px", color: c.text, lineHeight:"1.5" }}>{msg.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
