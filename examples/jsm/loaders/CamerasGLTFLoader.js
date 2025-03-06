import {
	FileLoader,
	Group,
	Loader,
	LoaderUtils,
	MathUtils,
	Matrix4,
	Object3D,
	PerspectiveCamera,
} from 'three-css2d';

class CamerasGLTFLoader extends Loader {

	constructor(manager) {

		super(manager);

		this.dracoLoader = null;

		this.pluginCallbacks = [];
	}

	load(url, onLoad, onProgress, onError) {

		const scope = this;

		let resourcePath;

		if (this.resourcePath !== '') {

			resourcePath = this.resourcePath;

		} else if (this.path !== '') {

			resourcePath = this.path;

		} else {

			resourcePath = LoaderUtils.extractUrlBase(url);

		}

		// Tells the LoadingManager to track an extra item, which resolves after
		// the model is fully loaded. This means the count of items loaded will
		// be incorrect, but ensures manager.onLoad() does not fire early.
		this.manager.itemStart(url);

		const _onError = function (e) {

			if (onError) {

				onError(e);

			} else {

				console.error(e);

			}

			scope.manager.itemError(url);
			scope.manager.itemEnd(url);

		};

		const loader = new FileLoader(this.manager);

		loader.setPath(this.path);
		loader.setResponseType('arraybuffer');
		loader.setRequestHeader(this.requestHeader);
		loader.setWithCredentials(this.withCredentials);

		loader.load(url, function (data) {

			try {

				scope.parse(data, resourcePath, function (gltf) {

					onLoad(gltf);

					scope.manager.itemEnd(url);

				}, _onError);

			} catch (e) {

				_onError(e);

			}

		}, onProgress, _onError);

	}

	setDRACOLoader(dracoLoader) {

		this.dracoLoader = dracoLoader;
		return this;

	}

	register(callback) {

		if (this.pluginCallbacks.indexOf(callback) === - 1) {

			this.pluginCallbacks.push(callback);

		}

		return this;

	}


	parse(data, path, onLoad, onError) {

		let json;
		const extensions = {};
		const plugins = {};
		const textDecoder = new TextDecoder();

		if (typeof data === 'string') {

			json = JSON.parse(data);

		} else if (data instanceof ArrayBuffer) {

			const magic = textDecoder.decode(new Uint8Array(data, 0, 4));

			if (magic === BINARY_EXTENSION_HEADER_MAGIC) {

				try {

					extensions[EXTENSIONS.KHR_BINARY_GLTF] = new GLTFBinaryExtension(data);

				} catch (error) {

					if (onError) onError(error);
					return;

				}

				json = JSON.parse(extensions[EXTENSIONS.KHR_BINARY_GLTF].content);

			} else {

				json = JSON.parse(textDecoder.decode(data));

			}

		} else {

			json = data;

		}

		if (json.asset === undefined || json.asset.version[0] < 2) {

			if (onError) onError(new Error('THREE.CamerasCamerasGLTFLoader: Unsupported asset. glTF versions >=2.0 are supported.'));
			return;

		}

		const parser = new GLTFParser(json, {

			path: path || this.resourcePath || '',
			crossOrigin: this.crossOrigin,
			requestHeader: this.requestHeader,
			manager: this.manager

		});

		parser.fileLoader.setRequestHeader(this.requestHeader);

		for (let i = 0; i < this.pluginCallbacks.length; i++) {

			const plugin = this.pluginCallbacks[i](parser);
			plugins[plugin.name] = plugin;

			// Workaround to avoid determining as unknown extension
			// in addUnknownExtensionsToUserData().
			// Remove this workaround if we move all the existing
			// extension handlers to plugin system
			extensions[plugin.name] = true;

		}

		if (json.extensionsUsed) {

			for (let i = 0; i < json.extensionsUsed.length; ++i) {

				const extensionName = json.extensionsUsed[i];
				const extensionsRequired = json.extensionsRequired || [];

				switch (extensionName) {
					default:
						if (extensionsRequired.indexOf(extensionName) >= 0 && plugins[extensionName] === undefined) {

							console.warn('THREE.CamerasCamerasGLTFLoader: Unknown extension "' + extensionName + '".');

						}

				}

			}

		}

		parser.setExtensions(extensions);
		parser.setPlugins(plugins);
		parser.parse(onLoad, onError);

	}


}

/* GLTFREGISTRY */

function GLTFRegistry() {

	let objects = {};

	return {

		get: function (key) {

			return objects[key];

		},

		add: function (key, object) {

			objects[key] = object;

		},


		removeAll: function () {

			objects = {};

		}

	};

}

/*********************************/
/********** EXTENSIONS ***********/
/*********************************/

const EXTENSIONS = {
	KHR_BINARY_GLTF: 'KHR_binary_glTF',
};


/* BINARY EXTENSION */
const BINARY_EXTENSION_HEADER_MAGIC = 'glTF';
const BINARY_EXTENSION_HEADER_LENGTH = 12;
const BINARY_EXTENSION_CHUNK_TYPES = { JSON: 0x4E4F534A, BIN: 0x004E4942 };

class GLTFBinaryExtension {

	constructor(data) {

		this.name = EXTENSIONS.KHR_BINARY_GLTF;
		this.content = null;
		this.body = null;

		const headerView = new DataView(data, 0, BINARY_EXTENSION_HEADER_LENGTH);
		const textDecoder = new TextDecoder();

		this.header = {
			magic: textDecoder.decode(new Uint8Array(data.slice(0, 4))),
			version: headerView.getUint32(4, true),
			length: headerView.getUint32(8, true)
		};

		if (this.header.magic !== BINARY_EXTENSION_HEADER_MAGIC) {

			throw new Error('THREE.CamerasGLTFLoader: Unsupported glTF-Binary header.');

		} else if (this.header.version < 2.0) {

			throw new Error('THREE.CamerasGLTFLoader: Legacy binary file detected.');

		}

		const chunkContentsLength = this.header.length - BINARY_EXTENSION_HEADER_LENGTH;
		const chunkView = new DataView(data, BINARY_EXTENSION_HEADER_LENGTH);
		let chunkIndex = 0;

		while (chunkIndex < chunkContentsLength) {

			const chunkLength = chunkView.getUint32(chunkIndex, true);
			chunkIndex += 4;

			const chunkType = chunkView.getUint32(chunkIndex, true);
			chunkIndex += 4;

			if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.JSON) {

				const contentArray = new Uint8Array(data, BINARY_EXTENSION_HEADER_LENGTH + chunkIndex, chunkLength);
				this.content = textDecoder.decode(contentArray);

			} else if (chunkType === BINARY_EXTENSION_CHUNK_TYPES.BIN) {

				const byteOffset = BINARY_EXTENSION_HEADER_LENGTH + chunkIndex;
				this.body = data.slice(byteOffset, byteOffset + chunkLength);

			}

			// Clients must ignore chunks with unknown types.

			chunkIndex += chunkLength;

		}

		if (this.content === null) {

			throw new Error('THREE.CamerasGLTFLoader: JSON content not found.');

		}

	}

}

/*********************************/
/********** INTERNALS ************/
/*********************************/

function addUnknownExtensionsToUserData(knownExtensions, object, objectDef) {

	// Add unknown glTF extensions to an object's userData.

	for (const name in objectDef.extensions) {

		if (knownExtensions[name] === undefined) {

			object.userData.gltfExtensions = object.userData.gltfExtensions || {};
			object.userData.gltfExtensions[name] = objectDef.extensions[name];

		}

	}

}

/**
 * @param {Object3D|Material|BufferGeometry} object
 * @param {GLTF.definition} gltfDef
 */
function assignExtrasToUserData(object, gltfDef) {

	if (gltfDef.extras !== undefined) {

		if (typeof gltfDef.extras === 'object') {

			Object.assign(object.userData, gltfDef.extras);

		} else {

			console.warn('THREE.CamerasGLTFLoader: Ignoring primitive type .extras, ' + gltfDef.extras);

		}

	}

}

const _identityMatrix = new Matrix4();

/* GLTF PARSER */

class GLTFParser {

	constructor(json = {}, options = {}) {

		this.json = json;
		this.extensions = {};
		this.plugins = {};
		this.options = options;

		// loader object cache
		this.cache = new GLTFRegistry();

		// associations between Three.js objects and glTF elements
		this.associations = new Map();

		// BufferGeometry caching
		this.primitiveCache = {};

		// Node cache
		this.nodeCache = {};

		// Object3D instance caches
		this.meshCache = { refs: {}, uses: {} };
		this.cameraCache = { refs: {}, uses: {} };
		this.lightCache = { refs: {}, uses: {} };

		this.sourceCache = {};
		this.textureCache = {};

		// Track node names, to ensure no duplicates
		this.nodeNamesUsed = {};
		this.fileLoader = new FileLoader(this.options.manager);
		this.fileLoader.setResponseType('arraybuffer');

		if (this.options.crossOrigin === 'use-credentials') {

			this.fileLoader.setWithCredentials(true);

		}

	}

	setExtensions(extensions) {

		this.extensions = extensions;

	}

	setPlugins(plugins) {

		this.plugins = plugins;

	}

	parse(onLoad, onError) {

		const parser = this;
		const json = this.json;
		const extensions = this.extensions;

		// Clear the loader cache
		this.cache.removeAll();
		this.nodeCache = {};

		// Mark the special nodes/meshes in json for efficient parse
		this._invokeAll(function (ext) {

			return ext._markDefs && ext._markDefs();

		});

		Promise.all(this._invokeAll(function (ext) {

			return ext.beforeRoot && ext.beforeRoot();

		})).then(function () {

			return Promise.all([

				parser.getDependencies('scene'),
				parser.getDependencies('animation'),
				parser.getDependencies('camera'),

			]);

		}).then(function (dependencies) {

			const result = {
				scene: dependencies[0][json.scene || 0],
				scenes: dependencies[0],
				animations: dependencies[1],
				cameras: dependencies[2],
				asset: json.asset,
				parser: parser,
				userData: {}
			};

			addUnknownExtensionsToUserData(extensions, result, json);

			assignExtrasToUserData(result, json);

			Promise.all(parser._invokeAll(function (ext) {

				return ext.afterRoot && ext.afterRoot(result);

			})).then(function () {

				onLoad(result);

			});

		}).catch(onError);

	}

	/**
	 * Marks the special nodes/meshes in json for efficient parse.
	 */
	_markDefs() {

		const nodeDefs = this.json.nodes || [];
		const skinDefs = this.json.skins || [];
		const meshDefs = this.json.meshes || [];

		// Nothing in the node definition indicates whether it is a Bone or an
		// Object3D. Use the skins' joint references to mark bones.
		for (let skinIndex = 0, skinLength = skinDefs.length; skinIndex < skinLength; skinIndex++) {

			const joints = skinDefs[skinIndex].joints;

			for (let i = 0, il = joints.length; i < il; i++) {

				nodeDefs[joints[i]].isBone = true;

			}

		}

		// Iterate over all nodes, marking references to shared resources,
		// as well as skeleton joints.
		for (let nodeIndex = 0, nodeLength = nodeDefs.length; nodeIndex < nodeLength; nodeIndex++) {

			const nodeDef = nodeDefs[nodeIndex];

			if (nodeDef.mesh !== undefined) {

				this._addNodeRef(this.meshCache, nodeDef.mesh);

				// Nothing in the mesh definition indicates whether it is
				// a SkinnedMesh or Mesh. Use the node's mesh reference
				// to mark SkinnedMesh if node has skin.
				if (nodeDef.skin !== undefined) {

					meshDefs[nodeDef.mesh].isSkinnedMesh = true;

				}

			}

			if (nodeDef.camera !== undefined) {

				this._addNodeRef(this.cameraCache, nodeDef.camera);

			}

		}

	}

	/**
	 * Counts references to shared node / Object3D resources. These resources
	 * can be reused, or "instantiated", at multiple nodes in the scene
	 * hierarchy. Mesh, Camera, and Light instances are instantiated and must
	 * be marked. Non-scenegraph resources (like Materials, Geometries, and
	 * Textures) can be reused directly and are not marked here.
	 *
	 * Example: CesiumMilkTruck sample model reuses "Wheel" meshes.
	 */
	_addNodeRef(cache, index) {

		if (index === undefined) return;

		if (cache.refs[index] === undefined) {

			cache.refs[index] = cache.uses[index] = 0;

		}

		cache.refs[index]++;

	}

	/** Returns a reference to a shared resource, cloning it if necessary. */
	_getNodeRef(cache, index, object) {

		if (cache.refs[index] <= 1) return object;

		const ref = object.clone();

		// Propagates mappings to the cloned object, prevents mappings on the
		// original object from being lost.
		const updateMappings = (original, clone) => {

			const mappings = this.associations.get(original);
			if (mappings != null) {

				this.associations.set(clone, mappings);

			}

			for (const [i, child] of original.children.entries()) {

				updateMappings(child, clone.children[i]);

			}

		};

		updateMappings(object, ref);

		ref.name += '_instance_' + (cache.uses[index]++);

		return ref;

	}

	_invokeOne(func) {

		const extensions = Object.values(this.plugins);
		extensions.push(this);

		for (let i = 0; i < extensions.length; i++) {

			const result = func(extensions[i]);

			if (result) return result;

		}

		return null;

	}

	_invokeAll(func) {

		const extensions = Object.values(this.plugins);
		extensions.unshift(this);

		const pending = [];

		for (let i = 0; i < extensions.length; i++) {

			const result = func(extensions[i]);

			if (result) pending.push(result);

		}

		return pending;

	}

	/**
	 * Requests the specified dependency asynchronously, with caching.
	 * @param {string} type
	 * @param {number} index
	 * @return {Promise<Object3D|Camera>}
	 */
	getDependency(type, index) {

		const cacheKey = type + ':' + index;
		let dependency = this.cache.get(cacheKey);

		if (!dependency) {

			switch (type) {

				case 'scene':
					dependency = this.loadScene(index);
					break;

				case 'node':
					dependency = this._invokeOne(function (ext) {

						return ext.loadNode && ext.loadNode(index);

					});
					break;

				case 'camera':
					dependency = this.loadCamera(index);
					break;

				default:
					throw new Error('THREE.CamerasGLTFLoader: Unsupported dependency type: ' + type);

			}

			this.cache.add(cacheKey, dependency);

		}

		return dependency;

	}

	/**
	 * Requests all dependencies of the specified type asynchronously, with caching.
	 * @param {string} type
	 * @return {Promise<Array<Object>>}
	 */
	getDependencies(type) {

		let dependencies = this.cache.get(type);

		if (!dependencies) {

			const parser = this;
			const defs = this.json[type + (type === 'mesh' ? 'es' : 's')] || [];

			dependencies = Promise.all(defs.map(function (def, index) {

				return parser.getDependency(type, index);

			}));

			this.cache.add(type, dependencies);

		}

		return dependencies;

	}

	/** When Object3D instances are targeted by animation, they need unique names. */
	createUniqueName(originalName) {

		const sanitizedName = PropertyBinding.sanitizeNodeName(originalName || '');

		let name = sanitizedName;

		for (let i = 1; this.nodeNamesUsed[name]; ++i) {

			name = sanitizedName + '_' + i;

		}

		this.nodeNamesUsed[name] = true;

		return name;

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#cameras
	 * @param {number} cameraIndex
	 * @return {Promise<THREE.Camera>}
	 */
	loadCamera(cameraIndex) {

		let camera;
		const cameraDef = this.json.cameras[cameraIndex];
		const params = cameraDef[cameraDef.type];

		if (!params) {

			console.warn('THREE.CamerasGLTFLoader: Missing camera parameters.');
			return;

		}

		if (cameraDef.type === 'perspective') {

			camera = new PerspectiveCamera(MathUtils.radToDeg(params.yfov), params.aspectRatio || 1, params.znear || 1, params.zfar || 2e6);

		}

		if (cameraDef.name) camera.name = this.createUniqueName(cameraDef.name);

		assignExtrasToUserData(camera, cameraDef);

		return Promise.resolve(camera);

	}

	createNodeMesh(nodeIndex) {

		const json = this.json;
		const parser = this;
		const nodeDef = json.nodes[nodeIndex];

		if (nodeDef.mesh === undefined) return null;

		return parser.getDependency('mesh', nodeDef.mesh).then(function (mesh) {

			const node = parser._getNodeRef(parser.meshCache, nodeDef.mesh, mesh);

			// if weights are provided on the node, override weights on the mesh.
			if (nodeDef.weights !== undefined) {

				node.traverse(function (o) {

					if (!o.isMesh) return;

					for (let i = 0, il = nodeDef.weights.length; i < il; i++) {

						o.morphTargetInfluences[i] = nodeDef.weights[i];

					}

				});

			}

			return node;

		});

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#nodes-and-hierarchy
	 * @param {number} nodeIndex
	 * @return {Promise<Object3D>}
	 */
	loadNode(nodeIndex) {

		const json = this.json;
		const parser = this;

		const nodeDef = json.nodes[nodeIndex];

		const nodePending = parser._loadNodeShallow(nodeIndex);

		const childPending = [];
		const childrenDef = nodeDef.children || [];

		for (let i = 0, il = childrenDef.length; i < il; i++) {

			childPending.push(parser.getDependency('node', childrenDef[i]));

		}

		const skeletonPending = nodeDef.skin === undefined
			? Promise.resolve(null)
			: parser.getDependency('skin', nodeDef.skin);

		return Promise.all([
			nodePending,
			Promise.all(childPending),
			skeletonPending
		]).then(function (results) {

			const node = results[0];
			const children = results[1];
			const skeleton = results[2];

			if (skeleton !== null) {

				// This full traverse should be fine because
				// child glTF nodes have not been added to this node yet.
				node.traverse(function (mesh) {

					if (!mesh.isSkinnedMesh) return;

					mesh.bind(skeleton, _identityMatrix);

				});

			}

			for (let i = 0, il = children.length; i < il; i++) {

				node.add(children[i]);

			}

			return node;

		});

	}

	// ._loadNodeShallow() parses a single node.
	// skin and child nodes are created and added in .loadNode() (no '_' prefix).
	_loadNodeShallow(nodeIndex) {

		const json = this.json;
		const extensions = this.extensions;
		const parser = this;

		// This method is called from .loadNode() and .loadSkin().
		// Cache a node to avoid duplication.

		if (this.nodeCache[nodeIndex] !== undefined) {

			return this.nodeCache[nodeIndex];

		}

		const nodeDef = json.nodes[nodeIndex];

		// reserve node's name before its dependencies, so the root has the intended name.
		const nodeName = nodeDef.name ? parser.createUniqueName(nodeDef.name) : '';

		const pending = [];

		if (nodeDef.camera !== undefined) {

			pending.push(parser.getDependency('camera', nodeDef.camera).then(function (camera) {

				return parser._getNodeRef(parser.cameraCache, nodeDef.camera, camera);

			}));

		}

		parser._invokeAll(function (ext) {

			return ext.createNodeAttachment && ext.createNodeAttachment(nodeIndex);

		}).forEach(function (promise) {

			pending.push(promise);

		});

		this.nodeCache[nodeIndex] = Promise.all(pending).then(function (objects) {

			let node;

			// .isBone isn't in glTF spec. See ._markDefs
			if (nodeDef.isBone === true) {

				node = new Bone();

			} else if (objects.length > 1) {

				node = new Group();

			} else if (objects.length === 1) {

				node = objects[0];

			} else {

				node = new Object3D();

			}

			if (node !== objects[0]) {

				for (let i = 0, il = objects.length; i < il; i++) {

					node.add(objects[i]);

				}

			}

			if (nodeDef.name) {

				node.userData.name = nodeDef.name;
				node.name = nodeName;

			}

			assignExtrasToUserData(node, nodeDef);

			if (nodeDef.extensions) addUnknownExtensionsToUserData(extensions, node, nodeDef);

			if (nodeDef.matrix !== undefined) {

				const matrix = new Matrix4();
				matrix.fromArray(nodeDef.matrix);
				node.applyMatrix4(matrix);

			} else {

				if (nodeDef.translation !== undefined) {

					node.position.fromArray(nodeDef.translation);

				}

				if (nodeDef.rotation !== undefined) {

					node.quaternion.fromArray(nodeDef.rotation);

				}

				if (nodeDef.scale !== undefined) {

					node.scale.fromArray(nodeDef.scale);

				}

			}

			if (!parser.associations.has(node)) {

				parser.associations.set(node, {});

			}

			parser.associations.get(node).nodes = nodeIndex;

			return node;

		});

		return this.nodeCache[nodeIndex];

	}

	/**
	 * Specification: https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#scenes
	 * @param {number} sceneIndex
	 * @return {Promise<Group>}
	 */
	loadScene(sceneIndex) {

		const extensions = this.extensions;
		const sceneDef = this.json.scenes[sceneIndex];
		const parser = this;

		// Loader returns Group, not Scene.
		// See: https://github.com/mrdoob/three.js/issues/18342#issuecomment-578981172
		const scene = new Group();
		if (sceneDef.name) scene.name = parser.createUniqueName(sceneDef.name);

		assignExtrasToUserData(scene, sceneDef);

		if (sceneDef.extensions) addUnknownExtensionsToUserData(extensions, scene, sceneDef);

		const nodeIds = sceneDef.nodes || [];

		const pending = [];

		for (let i = 0, il = nodeIds.length; i < il; i++) {

			pending.push(parser.getDependency('node', nodeIds[i]));

		}

		return Promise.all(pending).then(function (nodes) {

			for (let i = 0, il = nodes.length; i < il; i++) {

				scene.add(nodes[i]);

			}

			// Removes dangling associations, associations that reference a node that
			// didn't make it into the scene.
			const reduceAssociations = (node) => {

				const reducedAssociations = new Map();

				node.traverse((node) => {

					const mappings = parser.associations.get(node);

					if (mappings != null) {

						reducedAssociations.set(node, mappings);

					}

				});

				return reducedAssociations;

			};

			parser.associations = reduceAssociations(scene);

			return scene;

		});

	}

}

export { CamerasGLTFLoader };