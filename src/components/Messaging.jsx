import React, { useState, useEffect } from 'react';

const Messaging = () => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');

    useEffect(() => {
        // Fetch messages from an API or a local source
        const fetchMessages = async () => {
            // Placeholder for fetching messages
            const fetchedMessages = await fetch('/api/messages'); // Adjust the API endpoint as needed
            const data = await fetchedMessages.json();
            setMessages(data);
        };

        fetchMessages();
    }, []);

    const handlePostMessage = async () => {
        if (newMessage.trim()) {
            // Placeholder for posting a new message
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: newMessage }),
            });

            if (response.ok) {
                const postedMessage = await response.json();
                setMessages([...messages, postedMessage]);
                setNewMessage('');
            }
        }
    };

    return (
        <div className="messaging">
            <h2>Event Messages</h2>
            <div className="message-feed">
                {messages.map((msg, index) => (
                    <div key={index} className="message">
                        {msg.message}
                    </div>
                ))}
            </div>
            <input
                type="text"
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
            />
            <button onClick={handlePostMessage}>Send</button>
        </div>
    );
};

export default Messaging;