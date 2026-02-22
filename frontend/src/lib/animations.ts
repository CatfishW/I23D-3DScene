import * as THREE from 'three';

// Standard bone roles for humanoid skeletons
export type BoneRole =
  | 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head'
  | 'leftShoulder' | 'leftArm' | 'leftForeArm' | 'leftHand'
  | 'rightShoulder' | 'rightArm' | 'rightForeArm' | 'rightHand'
  | 'leftUpLeg' | 'leftLeg' | 'leftFoot' | 'leftToe'
  | 'rightUpLeg' | 'rightLeg' | 'rightFoot' | 'rightToe'
  | 'leftThumb1' | 'leftThumb2' | 'leftThumb3'
  | 'leftIndex1' | 'leftIndex2' | 'leftIndex3'
  | 'leftMiddle1' | 'leftMiddle2' | 'leftMiddle3'
  | 'leftRing1' | 'leftRing2' | 'leftRing3'
  | 'leftLittle1' | 'leftLittle2' | 'leftLittle3'
  | 'rightThumb1' | 'rightThumb2' | 'rightThumb3'
  | 'rightIndex1' | 'rightIndex2' | 'rightIndex3'
  | 'rightMiddle1' | 'rightMiddle2' | 'rightMiddle3'
  | 'rightRing1' | 'rightRing2' | 'rightRing3'
  | 'rightLittle1' | 'rightLittle2' | 'rightLittle3';

export type BoneMap = Partial<Record<BoneRole, THREE.Bone>>;

// Patterns for matching bone names to roles (VRoid, Mixamo, generic)
const BONE_PATTERNS: Record<BoneRole, RegExp[]> = {
  hips: [/^J_Bip_C_Hips$/i, /^mixamorig:Hips$/i, /hip/i, /pelvis/i, /root/i],
  spine: [/^J_Bip_C_Spine$/i, /^mixamorig:Spine$/i, /^spine$/i],
  chest: [/^J_Bip_C_Chest$/i, /^mixamorig:Spine1$/i, /chest/i, /^spine[12]$/i],
  upperChest: [/^J_Bip_C_UpperChest$/i, /^mixamorig:Spine2$/i, /upper.?chest/i],
  neck: [/^J_Bip_C_Neck$/i, /^mixamorig:Neck$/i, /neck/i],
  head: [/^J_Bip_C_Head$/i, /^mixamorig:Head$/i, /^head$/i],
  leftShoulder: [/^J_Bip_L_Shoulder$/i, /^mixamorig:LeftShoulder$/i, /left.*shoulder/i],
  leftArm: [/^J_Bip_L_UpperArm$/i, /^mixamorig:LeftArm$/i, /left.*upper.*arm/i],
  leftForeArm: [/^J_Bip_L_LowerArm$/i, /^mixamorig:LeftForeArm$/i, /left.*(fore|lower).*arm/i],
  leftHand: [/^J_Bip_L_Hand$/i, /^mixamorig:LeftHand$/i, /left.*hand/i],
  rightShoulder: [/^J_Bip_R_Shoulder$/i, /^mixamorig:RightShoulder$/i, /right.*shoulder/i],
  rightArm: [/^J_Bip_R_UpperArm$/i, /^mixamorig:RightArm$/i, /right.*upper.*arm/i],
  rightForeArm: [/^J_Bip_R_LowerArm$/i, /^mixamorig:RightForeArm$/i, /right.*(fore|lower).*arm/i],
  rightHand: [/^J_Bip_R_Hand$/i, /^mixamorig:RightHand$/i, /right.*hand/i],
  leftUpLeg: [/^J_Bip_L_UpperLeg$/i, /^mixamorig:LeftUpLeg$/i, /left.*(up|upper|thigh).*leg/i],
  leftLeg: [/^J_Bip_L_LowerLeg$/i, /^mixamorig:LeftLeg$/i, /left.*(lower|lo|shin).*leg/i, /^left.*leg$/i],
  leftFoot: [/^J_Bip_L_Foot$/i, /^mixamorig:LeftFoot$/i, /left.*foot/i],
  rightUpLeg: [/^J_Bip_R_UpperLeg$/i, /^mixamorig:RightUpLeg$/i, /right.*(up|upper|thigh).*leg/i],
  rightLeg: [/^J_Bip_R_LowerLeg$/i, /^mixamorig:RightLeg$/i, /right.*(lower|lo|shin).*leg/i, /^right.*leg$/i],
  rightFoot: [/^J_Bip_R_Foot$/i, /^mixamorig:RightFoot$/i, /right.*foot/i],
  leftToe: [/^J_Bip_L_ToeBase$/i, /^mixamorig:LeftToeBase$/i, /left.*toe/i],
  rightToe: [/^J_Bip_R_ToeBase$/i, /^mixamorig:RightToeBase$/i, /right.*toe/i],
  leftThumb1: [/^J_Bip_L_Thumb1$/i, /^mixamorig:LeftHandThumb1$/i],
  leftThumb2: [/^J_Bip_L_Thumb2$/i, /^mixamorig:LeftHandThumb2$/i],
  leftThumb3: [/^J_Bip_L_Thumb3$/i, /^mixamorig:LeftHandThumb3$/i],
  leftIndex1: [/^J_Bip_L_Index1$/i, /^mixamorig:LeftHandIndex1$/i],
  leftIndex2: [/^J_Bip_L_Index2$/i, /^mixamorig:LeftHandIndex2$/i],
  leftIndex3: [/^J_Bip_L_Index3$/i, /^mixamorig:LeftHandIndex3$/i],
  leftMiddle1: [/^J_Bip_L_Middle1$/i, /^mixamorig:LeftHandMiddle1$/i],
  leftMiddle2: [/^J_Bip_L_Middle2$/i, /^mixamorig:LeftHandMiddle2$/i],
  leftMiddle3: [/^J_Bip_L_Middle3$/i, /^mixamorig:LeftHandMiddle3$/i],
  leftRing1: [/^J_Bip_L_Ring1$/i, /^mixamorig:LeftHandRing1$/i],
  leftRing2: [/^J_Bip_L_Ring2$/i, /^mixamorig:LeftHandRing2$/i],
  leftRing3: [/^J_Bip_L_Ring3$/i, /^mixamorig:LeftHandRing3$/i],
  leftLittle1: [/^J_Bip_L_Little1$/i, /^mixamorig:LeftHandLittle1$/i],
  leftLittle2: [/^J_Bip_L_Little2$/i, /^mixamorig:LeftHandLittle2$/i],
  leftLittle3: [/^J_Bip_L_Little3$/i, /^mixamorig:LeftHandLittle3$/i],
  rightThumb1: [/^J_Bip_R_Thumb1$/i, /^mixamorig:RightHandThumb1$/i],
  rightThumb2: [/^J_Bip_R_Thumb2$/i, /^mixamorig:RightHandThumb2$/i],
  rightThumb3: [/^J_Bip_R_Thumb3$/i, /^mixamorig:RightHandThumb3$/i],
  rightIndex1: [/^J_Bip_R_Index1$/i, /^mixamorig:RightHandIndex1$/i],
  rightIndex2: [/^J_Bip_R_Index2$/i, /^mixamorig:RightHandIndex2$/i],
  rightIndex3: [/^J_Bip_R_Index3$/i, /^mixamorig:RightHandIndex3$/i],
  rightMiddle1: [/^J_Bip_R_Middle1$/i, /^mixamorig:RightHandMiddle1$/i],
  rightMiddle2: [/^J_Bip_R_Middle2$/i, /^mixamorig:RightHandMiddle2$/i],
  rightMiddle3: [/^J_Bip_R_Middle3$/i, /^mixamorig:RightHandMiddle3$/i],
  rightRing1: [/^J_Bip_R_Ring1$/i, /^mixamorig:RightHandRing1$/i],
  rightRing2: [/^J_Bip_R_Ring2$/i, /^mixamorig:RightHandRing2$/i],
  rightRing3: [/^J_Bip_R_Ring3$/i, /^mixamorig:RightHandRing3$/i],
  rightLittle1: [/^J_Bip_R_Little1$/i, /^mixamorig:RightHandLittle1$/i],
  rightLittle2: [/^J_Bip_R_Little2$/i, /^mixamorig:RightHandLittle2$/i],
  rightLittle3: [/^J_Bip_R_Little3$/i, /^mixamorig:RightHandLittle3$/i],
};

/**
 * Find bones in a scene and map them to standard roles
 */
export function findBones(scene: THREE.Object3D): BoneMap {
  const bones: THREE.Bone[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Bone) {
      bones.push(child);
    }
  });

  const boneMap: BoneMap = {};
  const used = new Set<THREE.Bone>();

  for (const [role, patterns] of Object.entries(BONE_PATTERNS)) {
    for (const pattern of patterns) {
      const bone = bones.find(b => !used.has(b) && pattern.test(b.name));
      if (bone) {
        boneMap[role as BoneRole] = bone;
        used.add(bone);
        break;
      }
    }
  }

  return boneMap;
}

// Helper to create quaternion values from axis-angle
function q(ax: number, ay: number, az: number, angleDeg: number): number[] {
  const quat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(ax, ay, az).normalize(),
    (angleDeg * Math.PI) / 180
  );
  return [quat.x, quat.y, quat.z, quat.w];
}

const I = [0, 0, 0, 1]; // Identity quaternion

function makeTrack(boneName: string, times: number[], values: number[][]): THREE.QuaternionKeyframeTrack {
  return new THREE.QuaternionKeyframeTrack(
    boneName + '.quaternion',
    times,
    values.flat()
  );
}

/**
 * Create an idle breathing/swaying animation
 */
export function createIdleAnimation(boneMap: BoneMap): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];
  const t = [0, 1.5, 3, 4.5, 6];

  if (boneMap.spine) {
    tracks.push(makeTrack(boneMap.spine.name, t, [
      I, q(1, 0, 0, 2), I, q(1, 0, 0, -1), I
    ]));
  }
  if (boneMap.chest) {
    tracks.push(makeTrack(boneMap.chest.name, t, [
      I, q(1, 0, 0, 1.5), q(0, 1, 0, 1), q(1, 0, 0, -0.5), I
    ]));
  }
  if (boneMap.head) {
    tracks.push(makeTrack(boneMap.head.name, t, [
      I, q(0, 1, 0, 3), q(1, 0, 0, -2), q(0, 1, 0, -2), I
    ]));
  }
  if (boneMap.leftArm) {
    tracks.push(makeTrack(boneMap.leftArm.name, t, [
      I, q(0, 0, 1, 1), I, q(0, 0, 1, -1), I
    ]));
  }
  if (boneMap.rightArm) {
    tracks.push(makeTrack(boneMap.rightArm.name, t, [
      I, q(0, 0, 1, -1), I, q(0, 0, 1, 1), I
    ]));
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('Idle', 6, tracks);
}

/**
 * Create a wave animation (right arm)
 */
export function createWaveAnimation(boneMap: BoneMap): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];

  if (boneMap.rightShoulder) {
    tracks.push(makeTrack(boneMap.rightShoulder.name, [0, 0.4, 2.8, 3.2], [
      I, q(0, 0, 1, -15), q(0, 0, 1, -15), I
    ]));
  }
  if (boneMap.rightArm) {
    tracks.push(makeTrack(boneMap.rightArm.name, [0, 0.5, 2.5, 3], [
      I, q(0, 0, 1, -120), q(0, 0, 1, -120), I
    ]));
  }
  if (boneMap.rightForeArm) {
    tracks.push(makeTrack(boneMap.rightForeArm.name,
      [0, 0.5, 0.8, 1.1, 1.4, 1.7, 2.0, 2.3, 2.6, 3],
      [
        I,
        q(0, 1, 0, -30),
        q(0, 1, 0, 30),
        q(0, 1, 0, -30),
        q(0, 1, 0, 30),
        q(0, 1, 0, -30),
        q(0, 1, 0, 30),
        q(0, 1, 0, -30),
        q(0, 1, 0, 30),
        I,
      ]
    ));
  }
  if (boneMap.head) {
    tracks.push(makeTrack(boneMap.head.name, [0, 0.5, 1.5, 2.5, 3], [
      I, q(0, 1, 0, 15), q(0, 1, 0, -10), q(0, 1, 0, 10), I
    ]));
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('Wave', 3.2, tracks);
}

/**
 * Create a simple walk cycle animation
 */
export function createWalkAnimation(boneMap: BoneMap): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];
  const t = [0, 0.25, 0.5, 0.75, 1.0];

  // Legs alternate
  if (boneMap.leftUpLeg) {
    tracks.push(makeTrack(boneMap.leftUpLeg.name, t, [
      q(1, 0, 0, -20), I, q(1, 0, 0, 20), I, q(1, 0, 0, -20)
    ]));
  }
  if (boneMap.rightUpLeg) {
    tracks.push(makeTrack(boneMap.rightUpLeg.name, t, [
      q(1, 0, 0, 20), I, q(1, 0, 0, -20), I, q(1, 0, 0, 20)
    ]));
  }
  if (boneMap.leftLeg) {
    tracks.push(makeTrack(boneMap.leftLeg.name, t, [
      q(1, 0, 0, 30), q(1, 0, 0, 5), I, q(1, 0, 0, 5), q(1, 0, 0, 30)
    ]));
  }
  if (boneMap.rightLeg) {
    tracks.push(makeTrack(boneMap.rightLeg.name, t, [
      I, q(1, 0, 0, 5), q(1, 0, 0, 30), q(1, 0, 0, 5), I
    ]));
  }

  // Arms swing opposite to legs
  if (boneMap.leftArm) {
    tracks.push(makeTrack(boneMap.leftArm.name, t, [
      q(1, 0, 0, 15), I, q(1, 0, 0, -15), I, q(1, 0, 0, 15)
    ]));
  }
  if (boneMap.rightArm) {
    tracks.push(makeTrack(boneMap.rightArm.name, t, [
      q(1, 0, 0, -15), I, q(1, 0, 0, 15), I, q(1, 0, 0, -15)
    ]));
  }
  if (boneMap.leftForeArm) {
    tracks.push(makeTrack(boneMap.leftForeArm.name, t, [
      q(1, 0, 0, -20), q(1, 0, 0, -10), q(1, 0, 0, -20), q(1, 0, 0, -10), q(1, 0, 0, -20)
    ]));
  }
  if (boneMap.rightForeArm) {
    tracks.push(makeTrack(boneMap.rightForeArm.name, t, [
      q(1, 0, 0, -20), q(1, 0, 0, -10), q(1, 0, 0, -20), q(1, 0, 0, -10), q(1, 0, 0, -20)
    ]));
  }

  // Spine slight twist
  if (boneMap.spine) {
    tracks.push(makeTrack(boneMap.spine.name, t, [
      q(0, 1, 0, -3), I, q(0, 1, 0, 3), I, q(0, 1, 0, -3)
    ]));
  }

  // Hips bob removed to prevent scale/teleport glitches on generated rigs

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('Walk', 1.0, tracks);
}

/**
 * Create a simple dance animation
 */
export function createDanceAnimation(boneMap: BoneMap): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];
  const t = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

  if (boneMap.hips) {
    tracks.push(makeTrack(boneMap.hips.name, t, [
      I, q(0, 1, 0, 10), I, q(0, 1, 0, -10), I, q(0, 1, 0, 15), I, q(0, 1, 0, -15), I
    ]));
    // Hips bob removed to prevent teleport glitches
  }
  if (boneMap.spine) {
    tracks.push(makeTrack(boneMap.spine.name, t, [
      I, q(0, 0, 1, 5), I, q(0, 0, 1, -5), I, q(0, 0, 1, 8), I, q(0, 0, 1, -8), I
    ]));
  }
  if (boneMap.leftArm) {
    tracks.push(makeTrack(boneMap.leftArm.name, t, [
      q(0, 0, 1, 20), q(0, 0, 1, 45), q(0, 0, 1, 20), q(0, 0, 1, 45),
      q(0, 0, 1, 30), q(0, 0, 1, 60), q(0, 0, 1, 30), q(0, 0, 1, 60), q(0, 0, 1, 20)
    ]));
  }
  if (boneMap.rightArm) {
    tracks.push(makeTrack(boneMap.rightArm.name, t, [
      q(0, 0, 1, -20), q(0, 0, 1, -45), q(0, 0, 1, -20), q(0, 0, 1, -45),
      q(0, 0, 1, -30), q(0, 0, 1, -60), q(0, 0, 1, -30), q(0, 0, 1, -60), q(0, 0, 1, -20)
    ]));
  }
  if (boneMap.leftForeArm) {
    tracks.push(makeTrack(boneMap.leftForeArm.name, t, [
      q(1, 0, 0, -30), q(1, 0, 0, -60), q(1, 0, 0, -30), q(1, 0, 0, -60),
      q(1, 0, 0, -40), q(1, 0, 0, -70), q(1, 0, 0, -40), q(1, 0, 0, -70), q(1, 0, 0, -30)
    ]));
  }
  if (boneMap.rightForeArm) {
    tracks.push(makeTrack(boneMap.rightForeArm.name, t, [
      q(1, 0, 0, -30), q(1, 0, 0, -60), q(1, 0, 0, -30), q(1, 0, 0, -60),
      q(1, 0, 0, -40), q(1, 0, 0, -70), q(1, 0, 0, -40), q(1, 0, 0, -70), q(1, 0, 0, -30)
    ]));
  }
  if (boneMap.head) {
    tracks.push(makeTrack(boneMap.head.name, t, [
      I, q(0, 1, 0, 8), I, q(0, 1, 0, -8), I, q(0, 1, 0, 12), I, q(0, 1, 0, -12), I
    ]));
  }
  if (boneMap.leftUpLeg) {
    tracks.push(makeTrack(boneMap.leftUpLeg.name, t, [
      I, q(1, 0, 0, -15), I, q(1, 0, 0, 5), I, q(1, 0, 0, -20), I, q(1, 0, 0, 5), I
    ]));
  }
  if (boneMap.rightUpLeg) {
    tracks.push(makeTrack(boneMap.rightUpLeg.name, t, [
      I, q(1, 0, 0, 5), I, q(1, 0, 0, -15), I, q(1, 0, 0, 5), I, q(1, 0, 0, -20), I
    ]));
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('Dance', 4, tracks);
}

/**
 * Create all available animation presets for a given scene
 */
export function createAnimationPresets(scene: THREE.Object3D): THREE.AnimationClip[] {
  const boneMap = findBones(scene);
  const clips: THREE.AnimationClip[] = [];

  const idle = createIdleAnimation(boneMap);
  if (idle) clips.push(idle);

  const wave = createWaveAnimation(boneMap);
  if (wave) clips.push(wave);

  const walk = createWalkAnimation(boneMap);
  if (walk) clips.push(walk);

  const dance = createDanceAnimation(boneMap);
  if (dance) clips.push(dance);

  return clips;
}

/**
 * Retarget animation clips from Mixamo bone naming to the model's bone naming.
 * Works by matching bone roles between source and target skeletons.
 */
export function retargetAnimation(
  clip: THREE.AnimationClip,
  targetScene: THREE.Object3D
): THREE.AnimationClip {
  const targetBoneMap = findBones(targetScene);

  // Build reverse map: source bone name → role
  // Mixamo naming patterns
  const mixamoToRole: Record<string, BoneRole> = {
    'mixamorig:Hips': 'hips',
    'mixamorig:Spine': 'spine',
    'mixamorig:Spine1': 'chest',
    'mixamorig:Spine2': 'upperChest',
    'mixamorig:Neck': 'neck',
    'mixamorig:Head': 'head',
    'mixamorig:LeftShoulder': 'leftShoulder',
    'mixamorig:LeftArm': 'leftArm',
    'mixamorig:LeftForeArm': 'leftForeArm',
    'mixamorig:LeftHand': 'leftHand',
    'mixamorig:RightShoulder': 'rightShoulder',
    'mixamorig:RightArm': 'rightArm',
    'mixamorig:RightForeArm': 'rightForeArm',
    'mixamorig:RightHand': 'rightHand',
    'mixamorig:LeftUpLeg': 'leftUpLeg',
    'mixamorig:LeftLeg': 'leftLeg',
    'mixamorig:LeftFoot': 'leftFoot',
    'mixamorig:RightUpLeg': 'rightUpLeg',
    'mixamorig:RightLeg': 'rightLeg',
    'mixamorig:RightFoot': 'rightFoot',
    'mixamorig:LeftToeBase': 'leftToe',
    'mixamorig:RightToeBase': 'rightToe',
    'mixamorig:LeftHandThumb1': 'leftThumb1',
    'mixamorig:LeftHandThumb2': 'leftThumb2',
    'mixamorig:LeftHandThumb3': 'leftThumb3',
    'mixamorig:LeftHandIndex1': 'leftIndex1',
    'mixamorig:LeftHandIndex2': 'leftIndex2',
    'mixamorig:LeftHandIndex3': 'leftIndex3',
    'mixamorig:LeftHandMiddle1': 'leftMiddle1',
    'mixamorig:LeftHandMiddle2': 'leftMiddle2',
    'mixamorig:LeftHandMiddle3': 'leftMiddle3',
    'mixamorig:LeftHandRing1': 'leftRing1',
    'mixamorig:LeftHandRing2': 'leftRing2',
    'mixamorig:LeftHandRing3': 'leftRing3',
    'mixamorig:LeftHandPinky1': 'leftLittle1',
    'mixamorig:LeftHandPinky2': 'leftLittle2',
    'mixamorig:LeftHandPinky3': 'leftLittle3',
    'mixamorig:RightHandThumb1': 'rightThumb1',
    'mixamorig:RightHandThumb2': 'rightThumb2',
    'mixamorig:RightHandThumb3': 'rightThumb3',
    'mixamorig:RightHandIndex1': 'rightIndex1',
    'mixamorig:RightHandIndex2': 'rightIndex2',
    'mixamorig:RightHandIndex3': 'rightIndex3',
    'mixamorig:RightHandMiddle1': 'rightMiddle1',
    'mixamorig:RightHandMiddle2': 'rightMiddle2',
    'mixamorig:RightHandMiddle3': 'rightMiddle3',
    'mixamorig:RightHandRing1': 'rightRing1',
    'mixamorig:RightHandRing2': 'rightRing2',
    'mixamorig:RightHandRing3': 'rightRing3',
    'mixamorig:RightHandPinky1': 'rightLittle1',
    'mixamorig:RightHandPinky2': 'rightLittle2',
    'mixamorig:RightHandPinky3': 'rightLittle3',
  };

  const newTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const [boneName, property] = track.name.split('.');

    // Try direct match first (if model uses same naming)
    let targetBoneName = boneName;

    // Try Mixamo → role → target mapping
    const role = mixamoToRole[boneName];
    if (role && targetBoneMap[role]) {
      targetBoneName = targetBoneMap[role]!.name;
    }

    // Clone the track with the new bone name
    const newTrack = track.clone();
    newTrack.name = `${targetBoneName}.${property}`;
    newTracks.push(newTrack);
  }

  return new THREE.AnimationClip(clip.name, clip.duration, newTracks);
}
