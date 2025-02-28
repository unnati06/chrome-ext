class Summarizer {
    constructor() {
        this.transformer = null;
        console.log('Summarizer constructor called');
        this.initTransformer();
    }

    async initTransformer() {
        try {
            console.log('Starting transformer initialization...');
            const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.15.0');
            console.log('Pipeline imported successfully');
            
            this.transformer = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6', {
                quantized: true
            });
            
            console.log('Transformer loaded successfully:', this.transformer);
        } catch (error) {
            console.error('Detailed transformer initialization error:', error);
        }
    }

    async summarize(context) {
        console.log('Summarize called with context length:', context?.length);
        console.log('Transformer status:', this.transformer ? 'loaded' : 'not loaded');

        if (!this.transformer || !context) {
            console.log('Early return - transformer or context missing');
            return context;
        }

        try {
            if (context.length < 1000) {
                console.log('Context too short for summarization');
                return context;
            }

            console.log('Starting summarization process...');
            const chunks = this.splitIntoChunks(context, 1000);
            console.log('Split into chunks:', chunks.length);
            let summaries = [];

            for (const chunk of chunks) {
                console.log('Processing chunk of length:', chunk.length);
                const result = await this.transformer(chunk, {
                    max_length: 150,
                    min_length: 30,
                    temperature: 0.7,
                });
                console.log('Chunk summarization result:', result);
                summaries.push(result[0].summary_text);
            }

            const finalSummary = summaries.join('\n\n');
            console.log('Summarization complete');

            return `[AI Summary]\n${finalSummary}\n\n[Original Context]\n${context}`;
        } catch (error) {
            console.error('Detailed summarization error:', error);
            return context;
        }
    }

    splitIntoChunks(text, maxLength) {
        const sentences = text.split(/[.!?]+\s+/);
        const chunks = [];
        let currentChunk = [];
        let currentLength = 0;

        for (const sentence of sentences) {
            if (currentLength + sentence.length > maxLength) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk.join('. ') + '.');
                    currentChunk = [sentence];
                    currentLength = sentence.length;
                }
            } else {
                currentChunk.push(sentence);
                currentLength += sentence.length;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk.join('. ') + '.');
        }

        return chunks;
    }
}

export default Summarizer; 