import md5 from 'md5';
import Vue from 'vue';

export interface Res {
    name: string;
    args: any;
    response: any;
    requestTime: number;
    error: any;
}

export type Responses = { [id: string]: Res };

export type Fn = (...args: any) => Promise<any>;
export type Update<T = any> = (
    response: T,
    fn: Fn,
    ...args: any
) => Promise<void>;
export type Call = (fn: Fn, ...args: any) => Promise<string>;
export type Cache<T = any> = (fn: Fn, ...args: any) => T;

export interface UseAsyncCacheReturn<T = any> {
    call: Call;
    response: T;
    update: Update;
    cache: Cache;
    error: any;
}

export function getId(fn: Fn, args: any): string {
    return md5(`${fn.name}::${JSON.stringify(args)}`);
}

class AsyncCache { // tslint:disable-line

    public state: { responses: Responses } = {
        responses: {},
    };

    constructor(
        private updateState: (asyncCache: AsyncCache, responses: Responses) => any,
    ) {}

    public call: Call = async (fn: Fn, ...args: any) => {
        const id = getId(fn, args);
        if (!this.isAlreadyRequesting(id)) {
            const requestTime = await this.setRequestTime(id, fn, args);
            try {
                const response = await fn(...args);
                await this.setResponse(id, fn, args, requestTime, response, null);
            } catch (error) {
                this.setError(id, fn, args, error);
            }
        }
        return id;
    }

    public update: Update = async (response: any, fn: Fn, ...args: any) => {
        const id = getId(fn, args);
        await this.setResponse(id, fn, args, Date.now(), response, null);
    }

    public cache: Cache = (fn: Fn, ...args: any) => {
        const id = getId(fn, args);
        return this.state.responses[id].response;
    }

    private setResponse = (
        id: string,
        fn: Fn,
        args: any,
        requestTime: number,
        response: any,
        error: any,
    ) => {
        const { name } = fn;
        const { responses } = this.state;
        responses[id] = { name, args, response, requestTime, error };
        // console.log('setResponse', id, responses[id]);
        return this.updateState(this, responses);
    }

    private setRequestTime = async (
        id: string,
        fn: Fn,
        args: any,
    ) => {
        const requestTime = Date.now();
        const data = this.state.responses[id];
        const response = data ? data.response : null;
        await this.setResponse(id, fn, args, requestTime, response, null);
        return requestTime;
    }

    private setError = async (
        id: string,
        fn: Fn,
        args: any,
        error: any,
    ) => {
        const data = this.state.responses[id];
        const response = data ? data.response : null;
        await this.setResponse(id, fn, args, data.requestTime, response, error);
    }

    private isAlreadyRequesting = (id: string): boolean => {
        const data = this.state.responses[id];
        return data && (Date.now() - data.requestTime) < 200;
    }
}

export const cache = new AsyncCache(
    (asyncCache, responses) => {
        Vue.set(asyncCache.state.responses, 'responses', responses);
    },
    // for React but let see if component can extends AsyncCache
    // this would go in constructor
    // (asyncCache, responses) => {
    //     return new Promise((resolve) => {
    //         asyncCache.setState({ responses }, resolve);
    //     });
    // },
);

export class UseAsyncCache { // tslint:disable-line
    public state: { id: string, response: any } = {
        id: '',
        response: null,
    };

    public call: Call = async (fn: Fn, ...args: any) => {
        const id = getId(fn, args);
        Vue.set(this.state, 'id', id);
        return cache.call(fn, ...args);
    }

    public getResponse = () => {
        return cache.state.responses[this.state.id];
    }
}
