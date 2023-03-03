import { REVISION } from './constants.js';

export { Scene } from './scenes/Scene.js';
export { PerspectiveCamera } from './cameras/PerspectiveCamera.js';
export { Camera } from './cameras/Camera.js';
export { Object3D } from './core/Object3D.js';
export { Layers } from './core/Layers.js';
export { EventDispatcher } from './core/EventDispatcher.js';
export { MathUtils } from './math/MathUtils.js';
export { Matrix4 } from './math/Matrix4.js';
export { Matrix3 } from './math/Matrix3.js';
export { Euler } from './math/Euler.js';
export { Vector4 } from './math/Vector4.js';
export { Vector3 } from './math/Vector3.js';
export { Quaternion } from './math/Quaternion.js';
export * from './constants.js';

if ( typeof __THREE_DEVTOOLS__ !== 'undefined' ) {

	__THREE_DEVTOOLS__.dispatchEvent( new CustomEvent( 'register', { detail: {
		revision: REVISION,
	} } ) );

}

if ( typeof window !== 'undefined' ) {

	if ( window.__THREE__ ) {

		console.warn( 'WARNING: Multiple instances of Three.js being imported.' );

	} else {

		window.__THREE__ = REVISION;

	}

}
