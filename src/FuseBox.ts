import { HTMLPlugin } from "./plugins/HTMLplugin";
import { JSONPlugin } from "./plugins/JSONplugin";
import { PathMaster } from "./PathMaster";
import { WorkFlowContext } from "./WorkflowContext";
import { CollectionSource } from "./CollectionSource";
import { Arithmetic, BundleData } from "./Arithmetic";
import { ModuleWrapper } from "./ModuleWrapper";
import { ModuleCollection } from "./ModuleCollection";
import * as path from "path";
import { each, chain, Chainable } from "realm-utils";
const appRoot = require("app-root-path");




/**
 *
 *
 * @export
 * @class FuseBox
 */
export class FuseBox {

    public virtualFiles: any;
    private collectionSource: CollectionSource;

    private context: WorkFlowContext;

    /**
     * Creates an instance of FuseBox.
     *
     * @param {*} opts
     *
     * @memberOf FuseBox
     */
    constructor(public opts: any) {
        this.context = new WorkFlowContext();
        this.collectionSource = new CollectionSource(this.context);
        opts = opts || {};
        let homeDir = appRoot.path;
        if (opts.homeDir) {
            homeDir = path.isAbsolute(opts.homeDir) ? opts.homeDir : path.join(appRoot.path, opts.homeDir);
        }
        if (opts.modulesFolder) {
            this.context.customModulesFolder =
                path.isAbsolute(opts.modulesFolder)
                    ? opts.modulesFolder : path.join(appRoot.path, opts.modulesFolder);
        }

        this.context.plugins = opts.plugins || [HTMLPlugin, JSONPlugin];
        if (opts.cache !== undefined) {
            this.context.useCache = opts.cache ? true : false;
            
        }
        this.context.setHomeDir(homeDir);
        if (opts.cache !== undefined) {
            this.context.setUseCache(opts.cache);
        }
        // In case of additional resources (or resourses to use with gulp)
        this.virtualFiles = opts.files;
    }

    public bundle(str: string, standalone?: boolean) {
        this.context.reset();
        let parser = Arithmetic.parse(str);
        let bundle: BundleData;

        return Arithmetic.getFiles(parser, this.virtualFiles, this.context.homeDir).then(data => {
            bundle = data;
            return this.process(data, standalone);
        }).then((contents) => {
            bundle.finalize(); // Clean up temp folder if required

            return contents;
        }).catch(e => {
            console.log(e.stack || e);
        });
    }

    public process(bundleData: BundleData, standalone?: boolean) {
        let bundleCollection = new ModuleCollection(this.context, "default");

        bundleCollection.pm = new PathMaster(this.context, bundleData.homeDir);
        let self = this;
        return bundleCollection.collectBundle(bundleData).then(module => {

            return chain(class extends Chainable {
                public defaultCollection: ModuleCollection;
                public nodeModules: Map<string, ModuleCollection>;
                public defaultContents: string;
                public globalContents = [];
                public setDefaultCollection() {
                    return bundleCollection;
                }

                public addDefaultContents() {
                    return self.collectionSource.get(this.defaultCollection).then((cnt: string) => {
                        self.context.log.echoDefaultCollection(this.defaultCollection, cnt);
                        this.globalContents.push(cnt);
                    });
                }

                public addNodeModules() {
                    return each(self.context.nodeModules, (collection: ModuleCollection) => {
                        return self.collectionSource.get(collection).then((cnt: string) => {
                            self.context.log.echoCollection(collection, cnt);
                            if (!collection.cachedName) {
                                self.context.cache.set(collection.info, cnt);
                            }
                            this.globalContents.push(cnt);
                        });
                    });
                }

                public format() {
                    return {
                        contents: this.globalContents,
                    };
                }

            }).then(result => {
                let contents = result.contents.join("\n");
                console.log("");
                if (this.context.printLogs) {
                    self.context.log.end();
                }
                return ModuleWrapper.wrapFinal(contents, bundleData.entry, standalone);
                // return {
                //     dump: this.dump,
                //     contents: ModuleWrapper.wrapFinal(result.contents, bundleData.entry, standalone)
                // };
            });
        });
    }
}
